import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface PdfSection {
  heading: string;
  body: string;
}

@Injectable()
export class PdfService {
  renderDocument(title: string, sections: PdfSection[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: 'A4',
        margins: { top: 56, right: 54, bottom: 56, left: 54 },
        info: { Title: title, Creator: 'PropEase' },
      });
      const chunks: Buffer[] = [];

      document.on('data', (chunk: Buffer | Uint8Array) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);

      document
        .fillColor('#14283F')
        .font('Helvetica-Bold')
        .fontSize(21)
        .text(title, { lineGap: 5 });
      document.moveDown(1.4);

      for (const section of sections) {
        document
          .fillColor('#14283F')
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(section.heading);
        document
          .moveDown(0.35)
          .fillColor('#526174')
          .font('Helvetica')
          .fontSize(10)
          .text(section.body, { lineGap: 3 });
        document.moveDown(1);
      }

      document.end();
    });
  }
}
