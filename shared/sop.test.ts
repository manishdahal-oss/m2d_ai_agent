import { describe, expect, it } from 'vitest';
import { BUSINESS_CATEGORIES, detectBusiness } from './knowledge/businessFeatures.ts';
import { answersNo, answersYes, currentStep, desktopAnswer, deterministicStep, leaveReason, recommendation, SOP, sopFallback } from './sop.ts';

const c = { helpline: '9333911911', downloadHost: 'vyaparapp.in' };

describe('business type detection (SOP mapping)', () => {
  it.each([
    ['kirana store hai', 'retail'],
    ['meri general store hai', 'retail'],
    ['wholesale trading', 'retail'],
    ['किराना दुकान', 'retail'],
    ['kapde ki dukan hai', 'clothing'],
    ['mobile shop hai', 'mobile_shop'],
    ['medical store chalata hoon', 'pharmacy'],
    ['दवाई की दुकान', 'pharmacy'],
    ['cctv installation', 'cctv'],
    ['restaurant hai', 'restaurant'],
    ['doodh dairy', 'dairy'],
    ['beauty parlour', 'salon'],
    ['solar panel ka kaam', 'solar'],
    ['electronics shop', 'electronics'],
    ['construction contractor', 'construction'],
    ['khad beej ki dukan', 'agriculture'],
    ['factory hai, manufacturing karte hain', 'manufacturing'],
    ['tour and travels', 'tour_travel'],
  ])('%s → %s', (text, key) => {
    expect(detectBusiness(text)?.key).toBe(key);
  });

  it('returns nothing for non-business replies', () => {
    for (const t of ['haan batao', 'ok', 'fees kya hai', 'hmm']) expect(detectBusiness(t), t).toBeNull();
  });

  it('every category except Tour & Travel has features and an approved example ending with the device question', () => {
    for (const b of BUSINESS_CATEGORIES) {
      if (b.key === 'tour_travel') expect(b.features).toEqual([]);
      else expect(b.example, b.key).toMatch(/Aapke paas desktop ya laptop hai kya\?$/);
    }
  });
});

describe('SOP steps', () => {
  it('reads the step from our last message', () => {
    expect(currentStep(undefined)).toBe('START');
    expect(currentStep(SOP.askBusiness('hinglish'))).toBe('ASKED_BUSINESS');
    expect(currentStep(recommendation(detectBusiness('kirana')!, 'hinglish'))).toBe('ASKED_DEVICE');
    expect(currentStep(SOP.askPlan('hinglish'))).toBe('ASKED_PLAN');
    expect(currentStep(SOP.hasDevice('hinglish', c))).toBe('DOWNLOAD_SHARED');
  });

  it('device question: yes → exact download/demo/helpline message', () => {
    const asked = recommendation(detectBusiness('kirana')!, 'hinglish');
    for (const yes of ['haan', 'ji hai', 'laptop hai', 'desktop hai', 'Yes', 'हाँ']) {
      expect(deterministicStep(yes, asked, 'hinglish', c)?.text, yes).toBe(
        'Theek hai. Aap Vyapar ka Desktop version vyaparapp.in se download kijiyega. Uske baad hum aapko full demo denge. Agar kuch dikkat ho to 9333911911 par call kijiye.',
      );
    }
  });

  it('leave the customer on "no" to the business or device question — nothing else', () => {
    const askedDevice = recommendation(detectBusiness('kirana')!, 'hinglish');
    for (const no of ['nahi', 'laptop nahi hai', 'mobile hi use karta hoon', 'No', "I don't have", 'नहीं']) expect(leaveReason(no, askedDevice), no).toMatch(/no desktop/);
    for (const no of ['no', 'nahi hai', 'koi business nahi', "don't have any business", 'नहीं']) expect(leaveReason(no, SOP.askBusiness('hinglish')), no).toMatch(/no business/);
    // not a plain "no" → keep talking
    expect(leaveReason('nahi, medical shop hai', SOP.askBusiness('hinglish'))).toBeNull();
    expect(leaveReason('Aapka business konsa hai? Bata dijiye', undefined)).toBeNull();
    expect(currentStep('Aapka business konsa hai? Bata dijiye, main aapko batati hoon.')).toBe('ASKED_BUSINESS');
    expect(leaveReason('haan laptop hai', askedDevice)).toBeNull();
    // "no" at other steps (e.g. to the opening "koi problem?") is not a reason to leave
    expect(leaveReason('nahi koi problem nahi', 'Hi,\n\nMera name Nisha hai...')).toBeNull();
    expect(leaveReason('nahi', undefined)).toBeNull();
  });

  it('no desktop / only mobile → leave at ANY step (real chat, 2026-09-30)', () => {
    for (const t of [
      'MERA COAL KA  STOCK ITEM HAI AUR MUZE MOBILE PER HI KAM KARNA HAI DESKTOP PER NAHI',
      'MUZE MOBILE APP CHAHIYE MOBILE APP KE BARE ME BATAYE',
      'MOBILE APP KA BATAO SIRF',
      'laptop nahi hai',
      "I don't have a laptop",
      'sirf mobile use karta hoon',
      'computer nahi hai, mobile pe chalega?',
      'ghar pe koi computer vagera nahi rakha hai',
      'laptop to abhi nahi liya',
      'Mobile hai',
      'No\nMobile hai',
      'phone hi hai',
    ]) expect(leaveReason(t, 'Hi,\n\nMera name Nisha hai...'), t).toMatch(/no desktop/);
    for (const t of ['KYA MUZE INWARD YA RECEIPT NOTE BANANE PER EWAY BILL BAN SAKTA HAI KYA', 'COAL TRADING KA', 'haan laptop hai', 'mobile shop hai', 'mobile app ka data desktop pe aayega?', 'laptop pe data nahi aayega kya?'])
      expect(leaveReason(t, 'Hi,\n\nMera name Nisha hai...'), t).toBeNull();
  });

  it('plan question: yes / no → exact SOP replies', () => {
    const asked = SOP.askPlan('hinglish');
    expect(deterministicStep('haan', asked, 'hinglish', c)?.text).toBe('Theek hai, jab aap desktop ya laptop lein, tab aap Vyapar ka Desktop version bhi use kar sakte hain.');
    expect(deterministicStep('nahi', asked, 'hinglish', c)?.text).toBe('Theek hai, koi baat nahi. Aap Vyapar mobile app ka use continue kar sakte hain.');
  });

  it('not interested → exact polite close at any step', () => {
    expect(deterministicStep('not interested', undefined, 'hinglish', c)?.text).toBe('Theek hai, koi baat nahi. Aapke time ke liye dhanyavaad.');
    expect(deterministicStep('mujhe nahi chahiye', SOP.askBusiness('hinglish'), 'hinglish', c)?.stage).toBe('NOT_INTERESTED');
  });

  it('demo and fees questions get the exact SOP answers at any step', () => {
    expect(deterministicStep('demo kaise milega?', 'x', 'hinglish', c)?.text).toBe('Desktop version download karne ke baad hum aapko full demo denge. Agar kisi bhi tarah ki dikkat ho to 9333911911 par call kar sakte hain.');
    expect(deterministicStep('fees kya hai', undefined, 'hinglish', c)?.text).toBe('Vyapar Desktop ka free trial version available hai. Kya aap ise try karna chahenge?');
  });

  it('a question at the device step is left to the AI (answered first)', () => {
    expect(deterministicStep('desktop mein kya difference hai?', recommendation(detectBusiness('kirana')!, 'hinglish'), 'hinglish', c)).toBeNull();
  });

  it('yes/no word handling', () => {
    expect(answersYes('laptop hai')).toBe(true);
    expect(answersNo('laptop nahi hai')).toBe(true);
    expect(answersYes('laptop nahi hai')).toBe(false);
    expect(answersYes('ghar pe koi computer vagera nahi rakha hai')).toBe(false);
    expect(answersYes('Mujhe kuch samajh nahi aa raha hai')).toBe(false);
    expect(answersNo('Mujhe kuch samhj me nhi aa raha h\nGold wala plan lena h')).toBe(false);
  });
});

describe('SOP without AI (fallback)', () => {
  it('opening reply → asks business type; business given → approved example', () => {
    expect(sopFallback('haan batao', [], 'template', 'hinglish', c).text).toBe(SOP.askBusiness('hinglish'));
    const r = sopFallback('medical store hai', [], SOP.askBusiness('hinglish'), 'hinglish', c);
    expect(r.text).toBe(detectBusiness('medical')!.example);
    expect(r.step).toBe('ASKED_DEVICE');
  });

  it('answers questions first: fees, download, demo', () => {
    expect(sopFallback('फीस क्या है', [], 'template', 'hinglish', c).text).toBe('Vyapar Desktop ka free trial version available hai. Kya aap ise try karna chahenge?');
    expect(sopFallback('download kaha se karna hai?', [], 'x', 'hinglish', c).text).toBe('Aap Vyapar ka Desktop version vyaparapp.in se download kar sakte hain. Aapke paas desktop ya laptop hai kya?');
    expect(sopFallback('demo kaise milega?', [], 'x', 'hinglish', c).text).toMatch(/full demo denge.*9333911911/);
  });

  it('Tour & Travel gets the no-feature SOP line (nothing invented)', () => {
    expect(sopFallback('tour and travels', [], SOP.askBusiness('hinglish'), 'hinglish', c).text).toBe(
      'Achha, samajh gaya. Aapke business ke liye desktop version bhi use kar sakte hain. Aapke paas desktop ya laptop hai kya?',
    );
  });

  it('English customers get English', () => {
    expect(sopFallback('What is this about?', [], 'template', 'en', c).text).toMatch(/^What type of business do you have\?/);
    expect(deterministicStep('yes I have', 'Do you have a desktop or laptop?', 'en', c)?.text).toMatch(/^Okay\. Please download the Vyapar Desktop version from vyaparapp.in/);
  });
});

describe('desktop flag', () => {
  const askedDevice = recommendation(detectBusiness('kirana')!, 'hinglish');
  it('YES / NO / unconfirmed', () => {
    expect(desktopAnswer('haan', askedDevice)).toBe('YES');
    expect(desktopAnswer('haan laptop hai, demo kaise milega?', 'x')).toBe('YES');
    expect(desktopAnswer('I have a laptop', undefined)).toBe('YES');
    expect(desktopAnswer('nahi', askedDevice)).toBe('NO');
    expect(desktopAnswer('ghar pe koi computer vagera nahi rakha hai', undefined)).toBe('NO');
    expect(desktopAnswer('MUZE MOBILE PER HI KAM KARNA HAI', undefined)).toBe('NO');
    expect(desktopAnswer('Mobile hai', askedDevice)).toBe('NO');
    expect(desktopAnswer('He', askedDevice)).toBe('YES');
    expect(desktopAnswer('haan', SOP.askBusiness('hinglish'))).toBeNull();
    expect(desktopAnswer('kirana store hai', SOP.askBusiness('hinglish'))).toBeNull();
  });
});
