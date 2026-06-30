import { StubFileConverter } from './stub-file.converter';

describe('StubFileConverter', () => {
  const conv = new StubFileConverter();

  it('reports needsConversion for non-PDF types', () => {
    expect(conv.needsConversion('application/pdf')).toBe(false);
    expect(conv.needsConversion('image/png')).toBe(true);
    expect(
      conv.needsConversion(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true);
  });

  it('passes a PDF through unchanged', async () => {
    const r = await conv.convert({
      sourceKey: 'a.pdf',
      mimeType: 'application/pdf',
      targetKey: 'a.pdf.pdf',
    });
    expect(r.converted).toBe(false);
    expect(r.pdfKey).toBe('a.pdf');
  });

  it('reports a conversion for non-PDF input', async () => {
    const r = await conv.convert({
      sourceKey: 'a.png',
      mimeType: 'image/png',
      targetKey: 'a.png.pdf',
    });
    expect(r.converted).toBe(true);
  });
});
