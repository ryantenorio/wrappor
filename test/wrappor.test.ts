import { bigEndianOf, buildBloom, getPRRMasks, signal } from '../src';

describe('Big Endian', () => {
  it('returns correct representation', () => {
    let testValue = 1,
    numBytes = 4,
    expectedVal = "\x00\x00\x00\x01"

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
    let bloom = 'v3'
    let secret = 'secret'
    let f = 0.5
    let numBits = 8
    let expected = [150, 202]
    expect(getPRRMasks(bloom, secret, f, numBits)).toEqual(expected)
  })
})