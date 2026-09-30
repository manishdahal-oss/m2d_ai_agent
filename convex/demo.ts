/**
 * DEMO DATA. Internal only (not callable from the browser):
 *   npx convex run demo:load    — replaces any existing demo data
 *   npx convex run demo:clear   — removes demo data only
 *
 * Every demo document has isDemo = true (customers also get external id 'DEMO-…').
 * The sending worker (phase 4+) must refuse to message isDemo customers.
 */
import type { ConversationState } from '../shared/conversationStates';
import type { Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { conversationSearchText, customerSearchText } from './lib/denormalize';
import { CUSTOMERS, DEMO_CAMPAIGN, LINK, type DemoConversation } from './lib/demoFixtures';

type Milestone = DemoConversation['milestones'][number];
const FIELD: Record<Milestone, string> = {
  contacted: 'contactedAt',
  reply: 'firstReplyAt',
  interested: 'interestedAt',
  link: 'linkSentAt',
  click: 'linkClickedAt',
  install: 'installationStartedAt',
  activated: 'activatedAt',
  notInterested: 'notInterestedAt',
  stopped: 'stoppedAt',
  needsHuman: 'needsHumanAt',
};

async function clearAll(ctx: MutationCtx): Promise<number> {
  const customers = await ctx.db.query('customers').withIndex('by_demo', (i) => i.eq('isDemo', true)).collect();
  for (const c of customers) {
    const convs = await ctx.db.query('conversations').withIndex('by_customer', (i) => i.eq('customerId', c._id)).collect();
    for (const conv of convs) {
      for (const table of ['messages', 'conversationEvents', 'aiRuns'] as const) {
        const rows = await ctx.db.query(table).withIndex('by_conversation', (i) => i.eq('conversationId', conv._id)).collect();
        for (const r of rows) await ctx.db.delete(r._id);
      }
      await ctx.db.delete(conv._id);
    }
    for (const e of await ctx.db.query('campaignCustomers').withIndex('by_customer', (i) => i.eq('customerId', c._id)).collect()) await ctx.db.delete(e._id);
    await ctx.db.delete(c._id);
  }
  for (const campaign of await ctx.db.query('campaigns').withIndex('by_demo', (i) => i.eq('isDemo', true)).collect()) await ctx.db.delete(campaign._id);
  return customers.length;
}

export const clear = internalMutation({
  args: {},
  handler: async (ctx) => ({ removedCustomers: await clearAll(ctx) }),
});

export const load = internalMutation({
  args: {},
  handler: async (ctx) => {
    await clearAll(ctx);
    const now = Date.now();
    const campaignId = await ctx.db.insert('campaigns', {
      name: DEMO_CAMPAIGN,
      description: 'DEMO DATA — Convert eligible Vyapar mobile customers into Vyapar Desktop users.',
      segment: { languages: ['en', 'hi'], excludeAssigned: true },
      aiInstructions:
        'Help eligible Vyapar mobile customers understand Vyapar Desktop and encourage interested customers to try/install it. Only use approved Vyapar information.',
      messageTemplate:
        'Hi {{name}}, did you know that you can also use Vyapar on your desktop? Vyapar Desktop has a free version and can make it easier to manage your business on a larger screen.\n\nWould you like to know more?',
      templateLanguage: 'en',
      desktopDownloadUrl: LINK,
      status: 'RUNNING',
      sendRatePerMinute: 20,
      startedAt: now - 6 * 86_400_000,
      isDemo: true,
    });

    let conversations = 0;
    for (const [i, c] of CUSTOMERS.entries()) {
      const eligibility = c.assignedAgent
        ? 'ASSIGNED_TO_HUMAN'
        : c.desktopStatus
          ? 'DESKTOP_ALREADY_ACTIVE'
          : c.conversation?.state === 'STOPPED'
            ? 'OPTED_OUT'
            : 'ELIGIBLE';
      const externalId = `DEMO-${String(i + 1).padStart(3, '0')}`;
      const customerId = await ctx.db.insert('customers', {
        externalId,
        name: c.name,
        phone: c.phone,
        phoneRaw: c.phone,
        language: c.language,
        city: c.city,
        businessType: c.businessType,
        plan: c.plan,
        mobileUsage: c.mobileUsage,
        assignedAgent: c.assignedAgent,
        desktopStatus: c.desktopStatus,
        attributes: {},
        eligibility,
        optedOutAt: eligibility === 'OPTED_OUT' ? now - 2 * 86_400_000 : undefined,
        optOutSource: eligibility === 'OPTED_OUT' ? 'whatsapp:STOP' : undefined,
        lastActivityAt: now - 7 * 86_400_000 + i * 60_000,
        searchText: customerSearchText({ name: c.name, phone: c.phone, externalId, city: c.city }),
        isDemo: true,
      });
      const enrollmentId = await ctx.db.insert('campaignCustomers', {
        campaignId,
        customerId,
        eligibility: eligibility !== 'ELIGIBLE' && eligibility !== 'OPTED_OUT' ? 'EXCLUDED' : 'ELIGIBLE',
        exclusionReason: eligibility === 'ELIGIBLE' ? undefined : eligibility,
      });

      const conv = c.conversation;
      if (!conv) continue;

      // Spread over the last 6 days; messages a few minutes apart.
      let t = now - (6 - (i % 6)) * 86_400_000 + i * 3_600_000;
      const times = conv.script.map((_, k) => (t += (k === 0 ? 0 : 3 + (k % 4)) * 60_000));
      const last = times.length - 1;
      const linkIdx = conv.script.findIndex((l) => l.text.includes(LINK));
      const milestoneAt: Record<Milestone, number> = {
        contacted: times[0],
        reply: times[Math.min(1, last)],
        interested: times[Math.min(2, last)],
        link: times[linkIdx >= 0 ? linkIdx : last],
        click: times[last] + 20 * 60_000,
        install: times[last],
        activated: times[last] + 30 * 60_000,
        notInterested: times[last],
        stopped: times[last],
        needsHuman: times[last],
      };
      const milestones = Object.fromEntries(conv.milestones.map((m) => [FIELD[m], milestoneAt[m]]));
      const lastInbound = [...conv.script.keys()].reverse().find((k) => conv.script[k].from === 'CUSTOMER');
      const outbound = conv.script.filter((l) => l.from !== 'CUSTOMER').length;
      const lastLine = conv.script[last];

      const conversationId: Id<'conversations'> = await ctx.db.insert('conversations', {
        campaignId,
        customerId,
        campaignCustomerId: enrollmentId,
        state: conv.state,
        stateReason: conv.failed,
        needsHumanReason: conv.needsHumanReason,
        summary: conv.summary,
        aiPaused: false,
        ...milestones,
        lastMessageAt: times[last],
        lastInboundAt: lastInbound !== undefined ? times[lastInbound] : undefined,
        customerName: c.name,
        customerPhone: c.phone,
        customerLanguage: c.language,
        customerSegment: c.businessType,
        lastMessagePreview: lastLine.text.slice(0, 140),
        lastMessageSender: lastLine.from,
        outboundSent: conv.failed ? outbound - 1 : outbound,
        outboundDelivered: conv.failed ? outbound - 1 : outbound,
        inboundCount: conv.script.length - outbound,
        searchText: conversationSearchText({ customerName: c.name, customerPhone: c.phone }),
        isDemo: true,
      });
      await ctx.db.patch(customerId, { latestConversationId: conversationId, latestState: conv.state, lastActivityAt: times[last] });
      if (conv.milestones.includes('contacted')) await ctx.db.patch(enrollmentId, { contactedAt: milestoneAt.contacted });

      for (const [k, line] of conv.script.entries()) {
        const inbound = line.from === 'CUSTOMER';
        const failed = !!conv.failed && k === 0;
        const isTemplate = !inbound && 'template' in line && !!line.template;
        const messageId = await ctx.db.insert('messages', {
          conversationId,
          customerId,
          direction: inbound ? 'INBOUND' : 'OUTBOUND',
          senderType: line.from,
          body: line.text,
          messageType: isTemplate ? 'TEMPLATE' : 'TEXT',
          templateName: isTemplate ? 'm2d_desktop_intro_demo' : undefined,
          providerMessageId: failed ? undefined : `demo-${i}-${k}`,
          status: inbound ? 'RECEIVED' : failed ? 'FAILED' : k === last ? 'DELIVERED' : 'READ',
          error: failed ? conv.failed : undefined,
          attempts: inbound ? 0 : 1,
          metadata: { demo: true },
          at: times[k],
        });
        if (!inbound && 'ai' in line && line.ai) {
          await ctx.db.insert('aiRuns', {
            conversationId,
            replyMessageId: messageId,
            provider: 'demo',
            model: 'demo-fixture',
            promptVersion: 'demo',
            status: 'SUCCEEDED',
            intent: line.ai.intent,
            sentiment: line.ai.sentiment,
            stage: line.ai.stage,
            nextAction: line.ai.nextAction,
            confidence: line.ai.confidence,
            latencyMs: 800 + ((i * 131 + k * 97) % 900),
          });
        }
      }

      // State history, timestamped at the message that caused each transition.
      const path: ConversationState[] = ['NEW'];
      const add = (s: ConversationState) => path[path.length - 1] !== s && path.push(s);
      if (conv.milestones.includes('contacted')) add('MESSAGE_SENT');
      if (conv.milestones.includes('reply')) add('CUSTOMER_REPLIED');
      if (conv.milestones.includes('interested')) add('INTERESTED');
      if (conv.milestones.includes('link')) add('DESKTOP_LINK_SENT');
      if (conv.milestones.includes('click')) add('LINK_CLICKED');
      if (conv.milestones.includes('install')) add('INSTALLATION_STARTED');
      add(conv.state);
      const stepAt: Partial<Record<ConversationState, number>> = {
        MESSAGE_SENT: milestoneAt.contacted,
        CUSTOMER_REPLIED: milestoneAt.reply,
        INTERESTED: milestoneAt.interested,
        DESKTOP_LINK_SENT: milestoneAt.link,
        LINK_CLICKED: milestoneAt.click,
        INSTALLATION_STARTED: milestoneAt.install,
      };
      let prev = times[0];
      for (let k = 1; k < path.length; k++) {
        const at = Math.max(prev, path[k] === conv.state ? times[last] + 1000 : (stepAt[path[k]] ?? times[last]));
        prev = at;
        await ctx.db.insert('conversationEvents', {
          conversationId,
          fromState: path[k - 1],
          toState: path[k],
          reason: path[k] === conv.state ? (conv.needsHumanReason ?? conv.failed) : undefined,
          actor: 'demo',
          at,
        });
      }
      conversations++;
    }
    return { customers: CUSTOMERS.length, conversations };
  },
});
