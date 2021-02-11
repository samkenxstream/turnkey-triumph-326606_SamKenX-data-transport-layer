import { expect } from '../../../../setup'

import { validateBatchTransaction } from '../../../../../src/services/l1-ingestion/handlers/sequencer-batch-appended'

describe.only('Event Handlers: OVM_CanonicalTransactionChain.SequencerBatchAppended', () => {
  describe('validateBatchTransaction', () => {
    it('should catch the invalid transaction', () => {
      // CTC index 23159
      const valid = validateBatchTransaction('EIP155', {
        sig: {
          r:
            '0x0fbef2080fadc4198ee0d6027e2eb70799d3418574cc085c34a14dcefe14d5d3',
          s:
            '0x3bf394a7cb2aca6790e67382f782a406aefce7553212db52b54a4e087c2195ad',
          v: 56,
        },
        gasLimit: 8000000,
        gasPrice: 0,
        nonce: 0,
        target: '0x1111111111111111111111111111111111111111',
        data: '0x1234',
      })

      expect(valid).to.be.false
    })
  })
})
