import {
  bigEndianOf,
  EncoderConfig,
  RapporMode,
  RRandom,
  Wrappor,
} from '../src';

class MockRRandom implements RRandom {
  seeds: number[];

  constructor(seeds: number[]) {
    this.seeds = seeds;
  }

  generatePMask(p: number, s: number): number {
    return this.generateMask(p, s);
  }
  generateQMask(q: number, s: number): number {
    return this.generateMask(q, s);
  }

  generateMask(probability: number, s: number): number {
    let r = 0;
    for (let i = 0; i < s; i++) {
      let selection = this.seeds[i % this.seeds.length];
      let val = selection < probability ? 1 : 0;
      r |= val << i;
    }
    return r;
  }
}

describe('Big Endian', () => {
  it('returns correct representation', () => {
    let testValue = 8256,
      numBytes = 4,
      expectedVal = '\x00\x00 @';

    expect(bigEndianOf(testValue, numBytes)).toEqual(expectedVal);
  });
});

describe('Wrappor', () => {
  let seeds: number[] = [0.0, 0.6, 0.0],
    randGenerator: RRandom = new MockRRandom(seeds),
    mode: RapporMode = 'STANDARD',
    clientSecret: string = 'secret',
    clientCohort: number = 0,
    config: EncoderConfig = {
      bloomBits: 16,
      hashes: 2,
      totalCohorts: 64,
      pProb: 0.5,
      qProb: 0.75,
      fProb: 0.5,
    };

  let testObj = new Wrappor(
    config,
    clientCohort,
    clientSecret,
    mode,
    randGenerator
  );

  // this is the test pass that really matters
  it('full encoding pass works correctly', () => {
    expect(testObj.encode('abc')).toEqual(64493);
  });

  // the following unit tests use ts-ignore so we can test the private functions without complaint
  // unless a use-case would be discovered, the full encode is the only API that should really be exposed
  describe('Signal Step', () => {
    it('identifies correct bloom bits to set', () => {
      let cohort = 0,
        hashes = 2,
        word = 'abc',
        bloomSize = 16,
        expected = [6, 13];
      // @ts-ignore
      expect(testObj.signal(word, cohort, hashes, bloomSize)).toEqual(expected);
    });

    it('applies bloom bits to the bloom filter', () => {
      let bits = [6, 13];
      let expected = 8256;
      // @ts-ignore
      expect(testObj.buildBloom(bits)).toEqual(expected);
    });
  });

  describe('PRR Step', () => {
    it('calculates uniform and fmask correctly', () => {
      let word = 'v3';
      let secret = 'secret';
      let f = 0.5;
      let numBits = 8;
      let expected = [150, 202];
      // @ts-ignore
      expect(testObj.getPRRMasks(word, secret, f, numBits)).toEqual(expected);
    });

    it('generates the PRR correctly', () => {
      let bloom = 8256; // the string abc
      let secret = 'secret';
      let f = 0.5;
      let numBits = 16;
      let expected = 57576;
      // @ts-ignore
      expect(testObj.doPRR(bloom, secret, f, numBits)).toEqual(expected);
    });
  });

  describe('IRR Step', () => {
    it('generates the IRR correctly', () => {
      const prr = 57576;
      const p = 0.5;
      const numBits = 16;
      const q = 0.75;
      const seeds = [0.0, 0.6, 0.0];
      const mockRRandom = new MockRRandom(seeds);
      const expected = 64493;
      // @ts-ignore
      expect(testObj.doIRR(prr, mockRRandom, p, q, numBits)).toEqual(expected);
    });
  });
});
