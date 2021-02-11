import md5 from "md5";

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
  let hash = md5(value)
  
  let bloomBits: number[]
  bloomBits = []
  // original RAPPOR uses xrange which is still 0-indexed
  for(var i = 0; i < numHashes; i++) {
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

export const getBloom = (v: string, cohort: number, numHashes: number, bloomSize: number) => {
  let bloomBits = signal(v, cohort, numHashes, bloomSize)
  let bloom = buildBloom(bloomBits)

  return bloom
}