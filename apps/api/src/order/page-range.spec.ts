import { countPagesInRange, parsePageRange } from './page-range';

describe('parsePageRange', () => {
  it('parses a single page', () => {
    expect(parsePageRange('3', 10)).toEqual([3]);
  });

  it('parses a contiguous range', () => {
    expect(parsePageRange('2-5', 10)).toEqual([2, 3, 4, 5]);
  });

  it('parses a mixed list and de-duplicates', () => {
    expect(parsePageRange('1-3,3,5', 10)).toEqual([1, 2, 3, 5]);
  });

  it('clamps to the document length', () => {
    expect(parsePageRange('8-20', 10)).toEqual([8, 9, 10]);
  });

  it('normalises a reversed range', () => {
    expect(parsePageRange('5-2', 10)).toEqual([2, 3, 4, 5]);
  });

  it('ignores out-of-bounds and blank parts', () => {
    expect(parsePageRange('0,,11', 10)).toEqual([]);
  });
});

describe('countPagesInRange', () => {
  it('counts distinct pages', () => {
    expect(countPagesInRange('1-3,5,7-9', 10)).toBe(7);
  });

  it('counts zero for a range outside the document', () => {
    expect(countPagesInRange('50-60', 10)).toBe(0);
  });
});
