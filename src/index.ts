import { HmacSHA256 } from 'crypto-js';
import { randomInt } from 'crypto';
import md5 from 'md5';

/**
 * Interface implemented by PRNG's for use by the encoding algorithm
 * @public
 */
export interface RRandom {
  generatePMask(p: number, s: number): number;
  generateQMask(q: number, s: number): number;
}

/**
 * Interface implemented for memoization of PRR values
 * @public
 * 
 * @remarks
 * Users should pass in their own implementation of the PRRCache in production settings
 * to satisfy their requirements for retaining PRR values for long periods of time
 */
export interface PRRCache {
  get(word: string): number;
  put(word: string, prr: number): void;
}

/**
 * Interface implemented for the signal step in BASIC or BASIC ONE TIME modes of RAPPOR
 * @public
 */
export interface BasicSignaller {
  signal(word: string): number;
}

/**
 * Interface providing config needed for the RAPPOR encoder
 * @public
 */
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

/**
 * Type describing the RAPPOR modes supported by WRAPPOR
 */
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

export const bitString = (val: number, num: number) => {
  let bits = [];
  for (let i = 0; i < num; i++) {
    if (val & (1 << i)) {
      bits.push('1');
    } else {
      bits.push('0');
    }
  }
  return bits.reverse().join('');
};

/**
 * Represents default PRNG if none provided
 */
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
      let rand = randomInt(0, 10000)
      let val = rand < (probability * 10000);
      r |= Number(val) << i;
    }
    return r;
  }
}

/**
 * Represents in-memory implementation for memoization of PRR values.
 * @remarks
 * Not appropriate for use in production, users should implement their own depending on desired ability to retain PRR values.
 */
export class IMMCache implements PRRCache {
  generatedPRRs: Map<string, number>;

  constructor() {
    this.generatedPRRs = new Map();
  }

  get(word: string): number {
    let prr = this.generatedPRRs.get(word)
    if (prr === undefined) {
      return 0
    } else {
      return prr
    }
  }

  put(word: string, prr: number) {
    this.generatedPRRs.set(word, prr);
  }
}

/**
 * Represents RAPPOR encoder.
 */
export class Wrappor implements Encoder {
  config: EncoderConfig;
  clientCohort: number;
  clientSecret: string;
  randGenerator: RRandom;
  rapporMode: RapporMode;
  prrCache: PRRCache;
  basicSignaller: BasicSignaller | undefined;

  /**
   * 
   * @param config 
   * @param clientCohort 
   * @param clientSecret 
   * @param randGenerator 
   * @param mode 
   * @param prrCache 
   * @param basicSignaller 
   * 
   * @throws TypeError if Basic or Basic One Time mode needed and basicSignaller is undefined
   */
  constructor(
    config: EncoderConfig,
    clientCohort: number,
    clientSecret: string,
    mode: RapporMode,
    randGenerator?: RRandom,    
    prrCache?: PRRCache,
    basicSignaller?: BasicSignaller
  ) {
    this.config = config;
    this.clientCohort = clientCohort;
    this.clientSecret = clientSecret;
    this.rapporMode = mode;
    if (randGenerator === undefined) {
      this.randGenerator = new StandardRRandom();
    } else {
      this.randGenerator = randGenerator;
    }
    if (prrCache === undefined) {
      this.prrCache = new IMMCache();
    } else {
      this.prrCache = prrCache;
    }    
    if ( basicSignaller === undefined) {
      if (this.rapporMode == 'BASIC' || this.rapporMode == 'BASIC ONE-TIME') {
        throw TypeError("BASIC mode requires a valid BasicSignaller implementation");
      }      
    } else {
      this.basicSignaller = basicSignaller;
    }
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

  /**
   * Retrieves encoded value for a given word. 
   * 
   * Uses memoized PRR if value has been encoded before, otherwise stores PRR for future use
   * @param word the value to be encoded
   * @returns PRR if basic or basic-one-time mode, IRR otherwise
   * 
   * @throws TypeError if basic or basic-one-time mode is set and no BasicSignaller was provided
   */
  encode = (word: string) => {
    let irr = 0;    
    let prr = this.prrCache.get(word);
    if (prr == 0) {
      let bloom = 0;
      if (this.rapporMode == 'BASIC' || this.rapporMode == 'BASIC ONE-TIME') {
        if (this.basicSignaller === undefined) {
          // this shouldn't get thrown ever but we need this check          
          throw TypeError("BasicSignaller not defined");
        } else {
          bloom = this.basicSignaller.signal(word);
        }        
      } else {
        bloom = this.doSignal(
          word,
          this.clientCohort,
          this.config.hashes,
          this.config.bloomBits
        );
      }      
      prr = this.doPRR(
        bloom,
        this.clientSecret,
        this.config.fProb,
        this.config.bloomBits
      );
      this.prrCache.put(word, prr);
    }
    if (this.rapporMode == 'ONE-TIME' || this.rapporMode == 'BASIC ONE-TIME') {
      return prr;
    }
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
