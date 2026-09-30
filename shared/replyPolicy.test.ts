import { describe, expect, it } from 'vitest';
import { capDecision, closingMessage, conversationLanguage, detectLanguage, isAutoReply, isOptOut, isPersonal, isRepeat, wantsHuman } from './replyPolicy.ts';

const cfg = { messageLimit: 10, helpline: '9333911911', desktopDownloadUrl: 'https://vyaparapp.in' };

describe('reply policy', () => {
  it('detects opt-outs in English and Hindi/Hinglish, without false positives', () => {
    for (const t of ['STOP', 'stop.', 'Unsubscribe', 'please stop sending me messages', 'mat bhejo', 'band karo ye sab', 'मत भेजो']) expect(isOptOut(t), t).toBe(true);
    for (const t of ['haan batao', 'what is the price', 'will it stop working offline?', 'bus stop ke paas dukaan hai']) expect(isOptOut(t), t).toBe(false);
  });

  it('detects requests for a person', () => {
    for (const t of ['I want to talk to someone', 'Can someone call me?', 'call karo', 'kisi se baat karni hai']) expect(wantsHuman(t), t).toBe(true);
    for (const t of ['haan batao', 'kirana store hai']) expect(wantsHuman(t), t).toBe(false);
  });

  it('detects language, and short replies inherit the conversation language', () => {
    expect(detectLanguage('Yes please tell me more')).toBe('en');
    expect(detectLanguage('haan batao kya hai')).toBe('hinglish');
    expect(detectLanguage('हाँ बताइए')).toBe('hi');
    const h = [{ role: 'assistant' as const, text: 'Mai Divya Vyapar Se, Appne vyapar ka mobile app download kia tha na' }];
    expect(conversationLanguage('ok', h)).toBe('hinglish');
    expect(conversationLanguage('Is it good for GST filing?', h)).toBe('en');
  });

  it('caps at the limit: message #10 is the closing message, then nothing', () => {
    expect(capDecision(8, cfg)).toBe('normal');
    expect(capDecision(9, cfg)).toBe('closing');
    expect(capDecision(10, cfg)).toBe('blocked');
  });

  it('closing message asks to download (vyaparapp.in) and gives the helpline', () => {
    const m = closingMessage('hinglish', cfg);
    expect(m).toContain('vyaparapp.in');
    expect(m).not.toContain('https://');
    expect(m).toContain('9333911911');
  });

  it('detects repeats (exact, near-exact, contained) but not new points', () => {
    const prev = ['Vyapar Desktop ka free trial version available hai. Kya aap ise try karna chahenge?\n\nYahan se download karein: vyaparapp.in'];
    expect(isRepeat('Vyapar Desktop ka free trial version available hai. Kya aap ise try karna chahenge?', prev)).toBe(true);
    expect(isRepeat('Desktop par barcode se billing aur Excel import milta hai. Kya aap ise try karna chahenge?', prev)).toBe(false);
  });
});

describe('business auto-replies', () => {
  it('recognises WhatsApp Business greeting / away messages', () => {
    for (const t of [
      'Thank you for contacting HUMEIR CLOTHING! Please let us know how we can help you.',
      "Thank you for your message. We're unavailable right now, but will respond as soon as possible.",
      'Asalamualaikum \nWelcome to *Halal Groceries*🛒\n\nFresh Vegetables\nFruits\nChicken\nBeef\nKirana\nFrozen Items\n\nHome Delivery Available\n\nPlease send *ORDER* to Place your order',
      'Hello! How can we help you today?',
      'We are closed now. Our business hours are 10am to 8pm.',
    ]) expect(isAutoReply(t), t).toBe(true);
  });

  it('does not flag real customer replies', () => {
    for (const t of ['haan batao', 'thank you', 'Thanks, I will check', 'nahi koi problem nahi', 'kirana store hai', 'I run a clothing store', 'ok sir', 'login nahi ho raha', 'can you help me?', 'stop'])
      expect(isAutoReply(t), t).toBe(false);
  });
});

describe('personal messages', () => {
  it('flags personal / romantic messages', () => {
    for (const t of ['I love you 😘', 'I love you 😽', 'I love you 💞', 'miss you', 'aapse pyaar ho gaya', 'will you marry me', 'photo bhejo', 'kaha rehti ho', 'tum kitni saal ki ho?', 'how old are you', '😘😘', '❤️', 'आई लव यू'])
      expect(isPersonal(t), t).toBe(true);
  });

  it('does not flag business messages', () => {
    for (const t of ['baby clothes ki dukan hai', 'shaadi ka catering business hai', 'beauty parlour hai', 'haan laptop hai', 'thank you', '👍', 'ok', 'love the app, how to download desktop?'])
      expect(isPersonal(t), t).toBe(false);
  });
});
