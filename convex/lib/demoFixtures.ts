/**
 * DEMO fixtures — for exploring the dashboard before real customers / Times are connected.
 * Agent replies only use claims from the approved knowledge base (free version, larger screen).
 */
import type { ConversationState } from '../../shared/conversationStates';

export const DEMO_CAMPAIGN = 'September Mobile to Desktop Campaign (Demo)';
export const LINK = 'https://example.com/vyapar-desktop-download'; // placeholder — real URL pending

export type Line =
  | { from: 'AI' | 'SYSTEM' | 'HUMAN'; text: string; template?: boolean; ai?: { intent: string; sentiment: string; stage: string; nextAction: string; confidence: number } }
  | { from: 'CUSTOMER'; text: string };

export interface DemoConversation {
  state: ConversationState;
  milestones: Array<'contacted' | 'reply' | 'interested' | 'link' | 'click' | 'install' | 'activated' | 'notInterested' | 'stopped' | 'needsHuman'>;
  script: Line[];
  needsHumanReason?: string;
  summary?: string;
  failed?: string;
}

export interface DemoCustomer {
  name: string;
  phone: string;
  language: 'en' | 'hi';
  city: string;
  businessType: string;
  plan: string;
  mobileUsage: string;
  assignedAgent?: string;
  desktopStatus?: string;
  conversation?: DemoConversation;
}

const opening = (name: string): Line => ({
  from: 'SYSTEM',
  template: true,
  text: `Hi ${name}, did you know that you can also use Vyapar on your desktop? Vyapar Desktop has a free version and can make it easier to manage your business on a larger screen.\n\nWould you like to know more?`,
});
const openingHi = (name: string): Line => ({
  from: 'SYSTEM',
  template: true,
  text: `नमस्ते ${name}, क्या आप जानते हैं कि आप Vyapar को अपने कंप्यूटर पर भी इस्तेमाल कर सकते हैं? Vyapar Desktop का एक free version है, और बड़ी स्क्रीन पर बिज़नेस संभालना आसान हो सकता है।\n\nक्या आप और जानना चाहेंगे?`,
});
const ai = (text: string, intent: string, stage: string, nextAction: string, sentiment = 'Neutral', confidence = 0.9): Line => ({
  from: 'AI',
  text,
  ai: { intent, sentiment, stage, nextAction, confidence },
});

export const CUSTOMERS: DemoCustomer[] = [
  {
    name: 'Rahul Sharma', phone: '+919990000101', language: 'en', city: 'Jaipur', businessType: 'Retail', plan: 'Free', mobileUsage: 'High',
    conversation: {
      state: 'NEEDS_HUMAN', milestones: ['contacted', 'reply', 'interested', 'link', 'needsHuman'],
      needsHumanReason: 'Customer requested assistance.',
      summary: 'Customer is interested in Desktop but wants help installing it.',
      script: [
        opening('Rahul'),
        { from: 'CUSTOMER', text: 'Yes what is the benefit?' },
        ai('Desktop gives you a larger screen for managing billing and other business activities. If you use Vyapar frequently, it can make some tasks more convenient. Would you like me to share the Desktop link?', 'Benefit inquiry', 'AI conversation', 'Offer Desktop link', 'Positive'),
        { from: 'CUSTOMER', text: 'Is it free?' },
        ai('Yes, Vyapar Desktop has a free version. I can share the download link with you.', 'Pricing question', 'Interested', 'Send Desktop link', 'Positive', 0.95),
        { from: 'CUSTOMER', text: 'Send it' },
        ai(`Sure. Here is the Vyapar Desktop link:\n${LINK}\n\nIf you need help installing it, just let me know.`, 'Link request', 'Desktop link sent', 'Offer installation help', 'Positive', 0.97),
        { from: 'CUSTOMER', text: 'Can someone call me and help me install it?' },
        ai("Of course. I've asked a member of our team to help you with the installation. They'll reach out to you shortly.", 'Human assistance request', 'Needs human', 'Hand off to human agent', 'Positive', 0.93),
      ],
    },
  },
  {
    name: 'Priya Patel', phone: '+919990000102', language: 'en', city: 'Ahmedabad', businessType: 'Wholesale', plan: 'Gold', mobileUsage: 'High',
    conversation: {
      state: 'DESKTOP_ACTIVATED', milestones: ['contacted', 'reply', 'interested', 'link', 'click', 'install', 'activated'],
      script: [
        opening('Priya'),
        { from: 'CUSTOMER', text: 'Yes please share' },
        ai(`Sure. Here is the Vyapar Desktop link:\n${LINK}\n\nIf you need help installing it, just let me know.`, 'Link request', 'Desktop link sent', 'Wait for installation', 'Positive', 0.96),
        { from: 'CUSTOMER', text: 'Installed, working now. Thanks!' },
        ai("That's great to hear, Priya! Enjoy using Vyapar on the bigger screen. Reply here anytime if you need help.", 'Installation confirmed', 'Desktop activated', 'Close conversation', 'Positive', 0.95),
      ],
    },
  },
  {
    name: 'Amit Verma', phone: '+919990000103', language: 'hi', city: 'Lucknow', businessType: 'Retail', plan: 'Free', mobileUsage: 'Medium',
    conversation: {
      state: 'DESKTOP_LINK_SENT', milestones: ['contacted', 'reply', 'interested', 'link'],
      script: [
        openingHi('Amit ji'),
        { from: 'CUSTOMER', text: 'haan batao, free hai kya?' },
        ai('जी हाँ, Vyapar Desktop का एक free version है। क्या मैं आपको Desktop का download link भेज दूँ?', 'Pricing question', 'Interested', 'Offer Desktop link', 'Positive', 0.92),
        { from: 'CUSTOMER', text: 'haan bhejo' },
        ai(`ज़रूर। यह रहा Vyapar Desktop का link:\n${LINK}\n\nInstall करने में कोई मदद चाहिए तो बताइए।`, 'Link request', 'Desktop link sent', 'Offer installation help', 'Positive', 0.95),
      ],
    },
  },
  {
    name: 'Sneha Iyer', phone: '+919990000104', language: 'en', city: 'Chennai', businessType: 'Services', plan: 'Silver', mobileUsage: 'High',
    conversation: {
      state: 'LINK_CLICKED', milestones: ['contacted', 'reply', 'interested', 'link', 'click'],
      script: [
        opening('Sneha'),
        { from: 'CUSTOMER', text: 'Sure, send the link' },
        ai(`Sure. Here is the Vyapar Desktop link:\n${LINK}\n\nIf you need help installing it, just let me know.`, 'Link request', 'Desktop link sent', 'Wait for installation', 'Positive', 0.96),
      ],
    },
  },
  {
    name: 'Vikram Singh', phone: '+919990000105', language: 'en', city: 'Delhi', businessType: 'Distribution', plan: 'Free', mobileUsage: 'Low',
    conversation: {
      state: 'NOT_INTERESTED', milestones: ['contacted', 'reply', 'notInterested'],
      script: [
        opening('Vikram'),
        { from: 'CUSTOMER', text: 'No, mobile is enough for me' },
        ai("No problem at all, Vikram. If you ever want to try Desktop, just message us here. Have a great day!", 'Not interested', 'Not interested', 'Stop outreach', 'Neutral', 0.9),
      ],
    },
  },
  {
    name: 'Kavita Joshi', phone: '+919990000106', language: 'hi', city: 'Pune', businessType: 'Retail', plan: 'Free', mobileUsage: 'Medium',
    conversation: {
      state: 'STOPPED', milestones: ['contacted', 'reply', 'stopped'],
      script: [
        openingHi('Kavita ji'),
        { from: 'CUSTOMER', text: 'STOP' },
        { from: 'SYSTEM', text: 'आपको अब इस विषय पर कोई संदेश नहीं भेजा जाएगा। धन्यवाद।' },
      ],
    },
  },
  {
    name: 'Arjun Nair', phone: '+919990000107', language: 'en', city: 'Kochi', businessType: 'Pharmacy', plan: 'Gold', mobileUsage: 'High',
    conversation: {
      state: 'AI_CONVERSATION', milestones: ['contacted', 'reply'],
      script: [
        opening('Arjun'),
        { from: 'CUSTOMER', text: 'What can I do on desktop?' },
        ai('On Desktop you can manage billing and other business activities on a larger screen, which many frequent users find more convenient. Do you usually work from a computer at your shop?', 'Feature inquiry', 'AI conversation', 'Qualify computer access', 'Neutral', 0.88),
      ],
    },
  },
  {
    name: 'Meena Gupta', phone: '+919990000108', language: 'hi', city: 'Indore', businessType: 'Grocery', plan: 'Free', mobileUsage: 'High',
    conversation: {
      state: 'NEEDS_HUMAN', milestones: ['contacted', 'reply', 'needsHuman'],
      needsHumanReason: 'Question not covered by approved knowledge (data sync).',
      summary: 'Customer wants to know whether her mobile data will appear on Desktop. Approved answer not available yet.',
      script: [
        openingHi('Meena ji'),
        { from: 'CUSTOMER', text: 'mobile wala data desktop pe aa jayega kya?' },
        ai('अच्छा सवाल है। मैं इसकी सही जानकारी के लिए हमारी team से बात करवाती हूँ — वे जल्द ही आपसे संपर्क करेंगे।', 'Data sync question', 'Needs human', 'Hand off to human agent', 'Neutral', 0.42),
      ],
    },
  },
  {
    name: 'Rohit Kulkarni', phone: '+919990000109', language: 'en', city: 'Nagpur', businessType: 'Manufacturing', plan: 'Silver', mobileUsage: 'Medium',
    conversation: {
      state: 'INTERESTED', milestones: ['contacted', 'reply', 'interested'],
      script: [
        opening('Rohit'),
        { from: 'CUSTOMER', text: 'Yes, sounds useful' },
        ai('Great! Desktop lets you manage billing and your other business activities on a larger screen. Would you like me to send you the download link?', 'Positive interest', 'Interested', 'Offer Desktop link', 'Positive', 0.93),
      ],
    },
  },
  {
    name: 'Farhan Sheikh', phone: '+919990000110', language: 'en', city: 'Hyderabad', businessType: 'Electronics', plan: 'Free', mobileUsage: 'High',
    conversation: { state: 'MESSAGE_SENT', milestones: ['contacted'], script: [opening('Farhan')] },
  },
  {
    name: 'Pooja Reddy', phone: '+919990000111', language: 'en', city: 'Bengaluru', businessType: 'Retail', plan: 'Free', mobileUsage: 'Medium',
    conversation: { state: 'MESSAGE_SENT', milestones: ['contacted'], script: [opening('Pooja')] },
  },
  {
    name: 'Suresh Yadav', phone: '+919990000112', language: 'hi', city: 'Patna', businessType: 'Hardware', plan: 'Free', mobileUsage: 'Low',
    conversation: {
      state: 'FAILED', milestones: [], failed: 'Provider rejected the message (demo): number not on WhatsApp',
      script: [openingHi('Suresh ji')],
    },
  },
  {
    name: 'Anjali Mehta', phone: '+919990000113', language: 'en', city: 'Surat', businessType: 'Textiles', plan: 'Gold', mobileUsage: 'High',
    conversation: {
      state: 'INSTALLATION_STARTED', milestones: ['contacted', 'reply', 'interested', 'link', 'click', 'install'],
      script: [
        opening('Anjali'),
        { from: 'CUSTOMER', text: 'Yes send' },
        ai(`Sure. Here is the Vyapar Desktop link:\n${LINK}\n\nIf you need help installing it, just let me know.`, 'Link request', 'Desktop link sent', 'Wait for installation', 'Positive', 0.96),
        { from: 'CUSTOMER', text: 'Downloading now' },
        ai('Perfect. Let me know once it is installed, or if anything is unclear along the way.', 'Installation update', 'Installation started', 'Wait for activation', 'Positive', 0.9),
      ],
    },
  },
  { name: 'Deepak Chauhan', phone: '+919990000114', language: 'hi', city: 'Jaipur', businessType: 'Retail', plan: 'Free', mobileUsage: 'Medium' },
  { name: 'Neha Kapoor', phone: '+919990000115', language: 'en', city: 'Mumbai', businessType: 'Services', plan: 'Silver', mobileUsage: 'High' },
  { name: 'Sanjay Mishra', phone: '+919990000116', language: 'hi', city: 'Varanasi', businessType: 'Grocery', plan: 'Free', mobileUsage: 'High' },
  { name: 'Lakshmi Rao', phone: '+919990000117', language: 'en', city: 'Vizag', businessType: 'Pharmacy', plan: 'Free', mobileUsage: 'Low' },
  { name: 'Imran Khan', phone: '+919990000118', language: 'hi', city: 'Bhopal', businessType: 'Electronics', plan: 'Free', mobileUsage: 'Medium', assignedAgent: 'Technotask - Agent 14' },
  { name: 'Geeta Bansal', phone: '+919990000119', language: 'hi', city: 'Ludhiana', businessType: 'Retail', plan: 'Gold', mobileUsage: 'High', assignedAgent: 'technotask.team@partner' },
  { name: 'Ravi Teja', phone: '+919990000120', language: 'en', city: 'Vijayawada', businessType: 'Wholesale', plan: 'Silver', mobileUsage: 'High', desktopStatus: 'Active' },
];

