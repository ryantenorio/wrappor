import { HmacSHA256 } from "crypto-js";
import md5 from "md5"

export interface RRandom {
  generatePMask(p: number, s: number): number
  generateQMask(q: number, s: number): number
}

export const bigEndianOf = (val: number, bytes: number) => {
  // tried with a dataview, ended up using this solution for now: https://github.com/willscott/rappor/blob/master/rappor.js#L144
  let result = "";
  for (let i = (bytes - 1) * 8; i >= 0; i -= 8) {
    let currByte = (val & (0xFF << i)) >> i
    result = result.concat(String.fromCharCode(currByte))
  }  
  return result
}

// hash client's value v onto bloom filter B of size k using h hash functions
// returns the list of bits to activate in B
export const signal = (v: string, cohort: number, numHashes: number, bloomSize: number) => {
  // encode the value with the cohort  
  // currently uses same method as Google to benefit from their analysis tools  
  let value = bigEndianOf(cohort, 4) + v

  // hashing
  let hash = md5(value, {"asString": true})
  
  let bloomBits: number[]
  bloomBits = []
  // original RAPPOR uses xrange which is still 0-indexed
  for(let i = 0; i < numHashes; i++) {
    bloomBits.push(hash.charCodeAt(i) % bloomSize)
  }

  return bloomBits
}

export const buildBloom = (bitsToActivate: number[]) => {
  let bloom = 0
  bitsToActivate.forEach(bit => {
    bloom |= (1 << bit)
  })
  return bloom
}

export const doSignalStep = (v: string, cohort: number, numHashes: number, bloomSize: number) => {
  let bloomBits = signal(v, cohort, numHashes, bloomSize)
  let bloom = buildBloom(bloomBits)
  return bloom
}

export const getPRRMasks = (word: string, secret: string, f: number, numBits: number) => {
  let hash = HmacSHA256(word, secret).toString()

  let threshold128 = f * 128
  let uniform = 0
  let fMask = 0

  // hex string to byte array from crypto-js
  let hashBytes = []
  for(let c = 0; c < hash.length; c += 2) {
    hashBytes.push(parseInt(hash.substr(c, 2), 16))
  }

  for(let i = 0; i < numBits; i++) {    
    let byte = hashBytes[i]
    let uBit = byte & 0x01    
    
    uniform |= (uBit << i)

    let rand128 = byte >> 1 // 7 bits of entropy
    let noiseBit: number = (rand128 < threshold128) ? 1 : 0        
    fMask |= (noiseBit << i)
  }
  return [uniform, fMask]
}

export const doPRR = (word: string, secret: string, cohort: number, hashes: number, f: number, numBits: number) => {
  // index 0 is uniform, 1 is fmask
  // 16 bloombits, 2 hashes, 54 cohorts
  let bloom = doSignalStep(word, cohort, hashes, numBits)
  let masks = getPRRMasks(bigEndianOf(bloom, 4), secret, f, numBits)  
  let prr = 0

  prr = (bloom & ~masks[1]) | (masks[0] & masks[1])

  return prr
}

export const doIRR = (prr: number, randProvider: RRandom, p: number, q: number, s: number) => {
  let irr = 0
  let pBits = randProvider.generatePMask(p, s)
  let qBits = randProvider.generateQMask(q, s)
  irr = (pBits & ~prr) | (qBits & prr)
  return irr
}

export const encode = (word: string, secret: string, cohort: number, hashes: number, bits: number, f: number, p: number, q: number, randProvider: RRandom) => {
  let irr = 0
  let prr = doPRR(word, secret, cohort, hashes, f, bits)
  irr = doIRR(prr, randProvider, p, q, bits)
  return irr
}