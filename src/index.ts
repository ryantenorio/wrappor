import { HmacSHA256 } from 'crypto-js';
import md5 from 'md5';

export interface RRandom {
  generatePMask(p: number, s: number): number;
  generateQMask(q: number, s: number): number;
}

export interface EncoderConfig {
  bloomBits: number;
  hashes: number;
  totalCohorts: number;
  pProb: number;
  qProb: number;
  fProb: number;
}

interface Encoder {
  config: EncoderConfig;
  clientCohort: number;
  clientSecret: string;
  randGenerator: RRandom;
}

export type RapporMode = 'STANDARD' | 'ONE-TIME' | 'BASIC' | 'BASIC ONE-TIME';

export const bigEndianOf = (val: number, bytes: number) => {
  // tried with a dataview, ended up using this solution: https://github.com/willscott/rappor/blob/master/rappor.js#L144
  let result = '';
  for (let i = (bytes - 1) * 8; i >= 0; i -= 8) {
    let currByte = (val & (0xff << i)) >> i;
    result = result.concat(String.fromCharCode(currByte));
  }
  return result;
};

// @ts-ignore
export const bitString = (val: number, num: number) => {
  // let n = val.toString(2);
  // let res = '00000000000000000000000000000000'.substr(n.length) + n;
  // return res;
  let bits = []
  for (let i = 0; i < num; i++) {
    if (val & (1 << i)) {
      bits.push('1')
    } else {
      bits.push('0')
    }
  }
  return bits.reverse().join('');
}

export class StandardRRandom implements RRandom {
  generatePMask(p: number, s: number): number {
    return this.generateMask(p, s);
  }
  generateQMask(q: number, s: number): number {
    return this.generateMask(q, s);
  }
  generateMask(probability: number, s: number): number {
    let r = 0;
    for (let i = 0; i < s; i++) {
      let rand = Math.random();
      // let val = rand < probability ? 1 : 0;
      let val = rand < probability
      r |= Number(val) << i;
    }
    return r;
  }

}

export class Wrappor implements Encoder {
  config: EncoderConfig;
  clientCohort: number;
  clientSecret: string;
  randGenerator: RRandom;
  rapporMode: RapporMode;

  constructor(
    config: EncoderConfig,
    clientCohort: number,
    clientSecret: string,
    randGenerator: RRandom,
    mode: RapporMode
  ) {
    this.config = config;
    this.clientCohort = clientCohort;
    this.clientSecret = clientSecret;
    this.randGenerator = randGenerator;
    this.rapporMode = mode;
  }

  private signal = (
    v: string,
    cohort: number,
    numHashes: number,
    bloomSize: number
  ) => {
    // encode the value with the cohort the same way Google does it for rappor.py
    let value = bigEndianOf(cohort, 4) + v;

    // hashing
    let hash = md5(value, { asString: true });

    let bloomBits: number[];
    bloomBits = [];
    // rappor.py uses xrange which is still 0-indexed
    for (let i = 0; i < numHashes; i++) {
      bloomBits.push(hash.charCodeAt(i) % bloomSize);
    }

    return bloomBits;
  };

  private buildBloom = (bitsToActivate: number[]) => {
    let bloom = 0;
    bitsToActivate.forEach(bit => {
      bloom |= 1 << bit;
    });
    return bloom;
  };

  private doSignal = (
    v: string,
    cohort: number,
    numHashes: number,
    bloomSize: number
  ) => {
    let bloomBits = this.signal(v, cohort, numHashes, bloomSize);
    let bloom = this.buildBloom(bloomBits);
    return bloom;
  };

  private getPRRMasks = (
    word: string,
    secret: string,
    f: number,
    numBits: number
  ) => {
    let hash = HmacSHA256(word, secret).toString();

    let threshold128 = f * 128;
    let uniform = 0;
    let fMask = 0;

    // hex string to byte array from crypto-js: https://stackoverflow.com/a/34356351
    let hashBytes = [];
    for (let c = 0; c < hash.length; c += 2) {
      hashBytes.push(parseInt(hash.substr(c, 2), 16));
    }

    for (let i = 0; i < numBits; i++) {
      let byte = hashBytes[i];
      let uBit = byte & 0x01;

      uniform |= uBit << i;

      let rand128 = byte >> 1; // 7 bits of entropy
      let noiseBit: number = rand128 < threshold128 ? 1 : 0;
      fMask |= noiseBit << i;
    }
    return [uniform, fMask];
  };

  private doPRR = (bloom: number, secret: string, f: number, bits: number) => {
    // index 0 is uniform, 1 is fmask
    // 16 bloombits, 2 hashes, 54 cohorts

    let masks = this.getPRRMasks(bigEndianOf(bloom, 4), secret, f, bits);
    let prr = 0;

    prr = (bloom & ~masks[1]) | (masks[0] & masks[1]);

    return prr;
  };

  private doIRR = (
    prr: number,
    randProvider: RRandom,
    p: number,
    q: number,
    s: number
  ) => {
    let irr = 0;
    let pBits = randProvider.generatePMask(p, s);
    let qBits = randProvider.generateQMask(q, s);
    irr = (pBits & ~prr) | (qBits & prr);
    return irr;
  };

  encode = (word: string) => {
    let irr = 0;
    let bloom = this.doSignal(
      word,
      this.clientCohort,
      this.config.hashes,
      this.config.bloomBits
    );
    let prr = this.doPRR(
      bloom,
      this.clientSecret,
      this.config.fProb,
      this.config.bloomBits
    );
    irr = this.doIRR(
      prr,
      this.randGenerator,
      this.config.pProb,
      this.config.qProb,
      this.config.bloomBits
    );
    return irr;
  };
}
