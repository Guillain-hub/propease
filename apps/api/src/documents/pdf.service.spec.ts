import { PdfService } from './pdf.service.js';

describe('PdfService', () => {
  it('renders a PDF document with the provided sections', async () => {
    const pdf = await new PdfService().renderDocument('Lease summary', [
      { heading: 'Property', body: 'Unit 4, Kigali' },
    ]);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
  });
});
