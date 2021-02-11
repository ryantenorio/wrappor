import { bigEndianOf, buildBloom, signal } from '../src';

describe('Big Endian function', () => {
  it('returns correct representation', () => {
    let testValue = 0,
    numBytes = 4,
    expectedVal = "\x00\x00\x00\x00"

    expect(bigEndianOf(testValue, numBytes)).toEqual(expectedVal)
  })
})

describe('Signal Step', () => {
  it('signal the correct bloom bits to set', () => {
    let cohort = 0,
    hashes = 2,
    word = "abc",
    bloomSize = 16,
    expected = [6, 13]

    expect(signal(word, cohort, hashes, bloomSize)).toEqual(expected)
  })

  it('bloom bits applied to bloom filter', () => {
    let bits = [6, 13]
    let expected = 8256
    expect(buildBloom(bits)).toEqual(expected)
  })

  // it('correct B created', () => {
  //   let cohort = 0,
  //   hashes = 2,
  //   word = "abc",
  //   bloomSize = 16,
  //   expected = "8256"    
  //   expect(getBloom(word, cohort, hashes, bloomSize)).toEqual(expected)
  // })
})