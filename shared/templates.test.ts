import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATE, fillTemplate, placeholderCount } from './templates.ts';

describe('templates', () => {
  it('support_m2d has two variables: {{1}} blank, {{2}} INSTALL', () => {
    expect(placeholderCount(DEFAULT_TEMPLATE.text)).toBe(2);
    expect(fillTemplate(DEFAULT_TEMPLATE.text, DEFAULT_TEMPLATE.params)).toBe(
      'Hi,\n\nMera name Nisha hai, Aapne Vyapar mobile app par INSTALL kiya hai.\n\nAgar is process mein aapko koi problem aa rahi hai,',
    );
  });

  it('fills a name when given', () => {
    expect(fillTemplate('Hi {{1}}, app par {{2}} kiya hai.', ['Rahul', 'INSTALL'])).toBe('Hi Rahul, app par INSTALL kiya hai.');
  });
});
