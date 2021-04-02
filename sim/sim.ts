const csv = require('csv-parser');
const fs = require('fs');
const RapporMode = require('../dist').RapporMode
const EncoderConfig = require('../dist').EncoderConfig
const RRandom = require('../dist').RRandom
const StandardRRandom = require('../dist').StandardRRandom
const Wrappor = require('../dist').Wrappor
const BitString = require('../dist').bitString

// setup args
let args = process.argv;
let numBits: number = Number(args[2]);
let numHashes: number = Number(args[3]);
let numCohorts: number = Number(args[4]);
let pValue: number = Number(args[5]);
let qValue: number = Number(args[6]);
let fValue: number = Number(args[7]);
let input = args[8];
let output = args[9];

let config: typeof EncoderConfig = {
  bloomBits: numBits,
  hashes: numHashes,
  totalCohorts: numCohorts,
  pProb: pValue,
  qProb: qValue,
  fProb: fValue,
};

let mode: typeof RapporMode = 'STANDARD';
let randGenerator: typeof RRandom = new StandardRRandom();

const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csvWriter = createCsvWriter({
    path: output,
    header: [
        {id: 'client', title: 'client'},
        {id: 'cohort', title: 'cohort'},
        {id: 'bloom', title: 'bloom'},
        {id: 'prr', title: 'prr'},
        {id: 'irr', title: 'irr'}
    ]
});
// @ts-ignore
let results = []
let num = 0

// @ts-ignore
fs.createReadStream(input)
  .pipe(csv())
  // @ts-ignore
  .on('data', (data) => {
    num++
    if (num % 100000 == 0) {
      console.log("Total Processed:", num)
    }
    let client: string = data.client;
    let cohort: number = data.cohort;
    let secret: string = data.client;
    let value: string = data.value;    
    let e = new Wrappor(
      config,
      cohort,
      secret,
      randGenerator,
      mode
    )
    // @ts-ignore
    let bloom = e.doSignal(
      value,
      e.clientCohort,
      e.config.hashes,
      e.config.bloomBits
    );
    // @ts-ignore
    let prr = e.doPRR(
      bloom,
      e.clientSecret,
      e.config.fProb,
      e.config.bloomBits
    );
    // @ts-ignore
    let irr = e.doIRR(
      prr,
      e.randGenerator,
      e.config.pProb,
      e.config.qProb,
      e.config.bloomBits
    );
    let record = {'client': client, 'cohort': cohort, 'bloom': BitString(bloom,numBits), 'prr': BitString(prr,numBits), 'irr': BitString(irr,numBits)}

    // let record = {'client': client, 'cohort': cohort, 'bloom': BitString(bloom,numBits), 'prr': BitString(prr,numBits), 'irr': BitString(irr,numBits), 'bloomA': bloom, 'prrA': prr, 'irrA': irr}
    // console.log(record)
    results.push(record)
  })
  .on('end', () => {
    // @ts-ignore
    csvWriter.writeRecords(results).then(() => console.log("DONE WRITING"));
  });

  
