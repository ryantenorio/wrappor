import { bigEndianOf, buildBloom, doIRR, doPRR, encode, getPRRMasks, RRandom, signal } from '../src';

describe('Big Endian', () => {
  it('returns correct representation', () => {
    let testValue = 8256,
    numBytes = 4,
    expectedVal = "\x00\x00 @"

    expect(bigEndianOf(testValue, numBytes)).toEqual(expectedVal)
  })
})

describe('Signal Step', () => {
  it('identifies correct bloom bits to set', () => {
    let cohort = 0,
    hashes = 2,
    word = 'abc',
    bloomSize = 16,
    expected = [6, 13]

    expect(signal(word, cohort, hashes, bloomSize)).toEqual(expected)
  })

  it('applies bloom bits to the bloom filter', () => {
    let bits = [6, 13]
    let expected = 8256
    expect(buildBloom(bits)).toEqual(expected)
  })
})

describe('PRR Step', () => {
  it('calculates uniform and fmask correctly', () => {
    let word = 'v3'
    let secret = 'secret'
    let f = 0.5
    let numBits = 8
    let expected = [150, 202]
    expect(getPRRMasks(word, secret, f, numBits)).toEqual(expected)
  })

  it('generates the PRR correctly', () => {
    let bloom = 8256 // the string abc
    let secret = 'secret'
    let f = 0.5
    let numBits = 16
    let expected = 57576
    expect(doPRR(bloom, secret, f, numBits)).toEqual(expected)
  })
})

describe('IRR Step', () => {
  it('generates the IRR correctly', () => {
    const prr = 57576
    const p = 0.5
    const numBits = 16
    const q = 0.75
    const seeds = [0.0, 0.6, 0.0]
    const mockRRandom = new MockRRandom(seeds)
    const expected = 64493
    expect(doIRR(prr, mockRRandom, p, q, numBits)).toEqual(expected)
  })
})

describe('Full Encode', () => {
  it('generates IRR correctly', () => {
    const word = 'abc'
    const secret = 'secret'
    const cohort = 0
    const hashes = 2
    const bits = 16
    const f = 0.5
    const p = 0.5
    const q = 0.75
    const seeds = [0.0, 0.6, 0.0]
    const mockRRandom = new MockRRandom(seeds)
    const expected = 64493
    expect(encode(word, secret, cohort, hashes, bits, f, p, q, mockRRandom)).toEqual(expected)
  })
})

class MockRRandom implements RRandom {
  seeds: number[]  

  constructor(seeds: number[]) {
    this.seeds = seeds
  }

  generatePMask(p: number, s: number): number {    
    return this.generateMask(p, s)
  }
  generateQMask(q: number, s: number): number {    
    return this.generateMask(q, s)
  }

  generateMask(probability: number, s: number): number {
    let r = 0
    for (let i = 0; i < s; i++) {
      let selection = this.seeds[i % this.seeds.length]
      let val = selection < probability ? 1 : 0
      r |= (val << i)
    }
    return r
  }
}