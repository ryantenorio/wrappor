# Wrappor

Wrappor is a project focused on implementing [RAPPOR](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/42852.pdf) in a JavaScript client to provide local differential privacy capabilities for web applications and mobile applications that support JavaScript (React Native, Ionic). To complement the client, a deployable toolkit will also be built to run a multi-client demo and to conduct statistical analysis on the data produced to gain insight on the impact of the privacy parameters to the utility of the dataset. 

# Usage
```
let encoder = new Wrappor(
    config,
    clientCohort,
    clientSecret,
    mode
  );

let encodedValue = encoder.encode('abc');
```

## PRR Memoization
The Wrappor class has an optional parameter that can be passed any object satisfying the PRRCache interface

```
export interface PRRCache {
  get(word: string): number;
  put(word: string, prr: number): void;
  remove(word: string): void;
}
```
If this isn't provided, an in-memory implementation is kept. This is NOT suggested for production as RAPPOR relies on memoization of the PRR for a given distinct value.

## Basic Mode Usage
RAPPOR's basic mode relies on the user providing their own mapper object to implement the signal step. The mapper should satisfy the provided interface and is passed into the Wrappor constructor as an optional parameter. For more information on when you want to use basic (or basic one-time) mode, refer to the original RAPPOR paper.

```
export interface BasicSignaller {
  signal(word: string): number;
}
```

## Random Number Generation
The RAPPOR algorithm relies on a random number generator to compute IRR values. If you have a specific implementation any object that satisfies the necessary interface can be passed into the Wrappor constructor
```
export interface RRandom {
  generatePMask(p: number, s: number): number;
  generateQMask(q: number, s: number): number;
}
```
