declare module "pdf-parse" {
  type PdfParseData = {
    text: string;
    info?: { Title?: string };
  };

  function parsePdf(buffer: Buffer): Promise<PdfParseData>;

  export default parsePdf;
}

declare module "pdf-parse/lib/pdf-parse.js" {
  const parse: unknown;
  export default parse;
}
