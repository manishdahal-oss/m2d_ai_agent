import { AlertCircle, Bot, Check, CheckCheck, Clock, FileText, Headset, Info } from 'lucide-react';
import type { ThreadMessage as Message } from '../lib/convex.ts';
import { fmtDate, fmtTime } from '../lib/format.ts';

const SENDER_LABEL: Record<Message['senderType'], string> = {
  CUSTOMER: 'Customer',
  AI: 'AI agent',
  HUMAN: 'Human agent',
  SYSTEM: 'Campaign',
};

function StatusTicks({ status }: { status: Message['status'] }) {
  if (status === 'READ') return <CheckCheck size={14} className="text-series-1" aria-label="Read" />;
  if (status === 'DELIVERED') return <CheckCheck size={14} className="text-ink-3" aria-label="Delivered" />;
  if (status === 'SENT') return <Check size={14} className="text-ink-3" aria-label="Sent" />;
  if (status === 'QUEUED') return <Clock size={13} className="text-ink-3" aria-label="Queued" />;
  if (status === 'FAILED') return <AlertCircle size={14} className="text-critical" aria-label="Failed" />;
  return null;
}

/** Safe, structured AI metadata — never chain-of-thought. */
function AiMeta({ ai }: { ai: NonNullable<Message['ai']> }) {
  const items: Array<[string, string | null]> = [
    ['Intent', ai.intent],
    ['Sentiment', ai.sentiment],
    ['Stage', ai.stage],
    ['Next action', ai.nextAction],
  ];
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
      {items
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <span key={k} className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-ink-2">
            <span className="text-ink-3">{k}:</span> {v}
          </span>
        ))}
      {ai.confidence != null && (
        <span className={`rounded-md border px-1.5 py-0.5 ${ai.confidence < 0.6 ? 'border-warning/60 text-ink' : 'border-line text-ink-2'} bg-surface`}>
          <span className="text-ink-3">Confidence:</span> {Math.round(ai.confidence * 100)}%
        </span>
      )}
    </div>
  );
}

export function ChatThread({ messages, showAiMeta = true }: { messages: Message[]; showAiMeta?: boolean }) {
  let lastDay = '';
  return (
    <ol className="wa-pattern space-y-2 px-3 py-4 sm:px-6" aria-label="Conversation">
      {messages.map((m) => {
        const day = fmtDate(m.at);
        const showDay = day !== lastDay;
        lastDay = day;
        const inbound = m.direction === 'INBOUND';
        const SenderIcon = m.senderType === 'AI' ? Bot : m.senderType === 'HUMAN' ? Headset : m.senderType === 'SYSTEM' ? Info : null;
        return (
          <li key={m._id} className="animate-in">
            {showDay && (
              <div className="my-3 flex justify-center">
                <span className="rounded-md bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-ink-2 shadow-sm">{day}</span>
              </div>
            )}
            <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[88%] sm:max-w-[70%] ${inbound ? '' : 'items-end'} flex flex-col`}>
                <div
                  className={`relative rounded-lg px-3 py-2 text-[14.5px] leading-relaxed text-ink shadow-sm ${
                    inbound ? 'rounded-tl-none bg-wa-in' : 'rounded-tr-none bg-wa-out'
                  }`}
                >
                  <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                    {SenderIcon && <SenderIcon size={12} aria-hidden />}
                    {SENDER_LABEL[m.senderType]}
                    {m.messageType === 'TEMPLATE' && (
                      <span className="ml-1 inline-flex items-center gap-0.5 normal-case tracking-normal" title={m.templateName}>
                        <FileText size={11} /> template
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-ink-3">
                    {fmtTime(m.at)}
                    {!inbound && <StatusTicks status={m.status} />}
                  </div>
                </div>
                {m.error && <p className="mt-1 text-xs text-critical">{m.error}</p>}
                {showAiMeta && m.ai && <AiMeta ai={m.ai} />}
                {m.replySkipped && <p className="mt-1 text-[11px] text-ink-3">Not answered automatically: {m.replySkipped}</p>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
