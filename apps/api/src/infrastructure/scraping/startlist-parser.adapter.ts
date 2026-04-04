import { Injectable } from '@nestjs/common';
import type {
  StartlistParserPort,
  ParsedStartlistEntry,
} from '../../application/benchmark/ports/startlist-parser.port';
import { parseStartlist } from './parsers/startlist.parser';

@Injectable()
export class StartlistParserAdapter implements StartlistParserPort {
  parseStartlist(html: string): ParsedStartlistEntry[] {
    return parseStartlist(html);
  }
}
