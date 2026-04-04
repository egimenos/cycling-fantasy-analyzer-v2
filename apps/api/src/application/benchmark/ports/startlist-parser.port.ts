export const STARTLIST_PARSER_PORT = Symbol('STARTLIST_PARSER_PORT');

export interface ParsedStartlistEntry {
  readonly riderName: string;
  readonly riderSlug: string;
  readonly teamName: string;
  readonly bibNumber: number | null;
}

export interface StartlistParserPort {
  parseStartlist(html: string): ParsedStartlistEntry[];
}
