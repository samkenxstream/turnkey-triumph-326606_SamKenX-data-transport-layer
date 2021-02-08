import { expect } from '../setup'

/* Imports: External */
import rimraf from 'rimraf'
import { getContractFactory } from '@eth-optimism/contracts'
import { encodeAppendSequencerBatch, ctcCoder } from '@eth-optimism/core-utils'
import { Contract, providers, Signer } from 'ethers'
import { ethers } from 'hardhat'

/* Imports: Internal */
import { L1DataTransportService } from '../../src/services/main/service'
import { L1DataTransportClient } from '../../src/client/client'
import { sleep } from '../../src/utils'

const DEFAULT_TEST_OPTIONS = {
  db: './db',
  port: 7878,
  confirmations: 0,
  l1RpcProvider: ethers.provider,
  pollingInterval: 10,
  logsPerPollingInterval: 2000,
}

// TODO: We'll likely have some code repetition here until we see the larger patterns. We'll
// eventually want some sort of framework for these tests.
describe('[L1 Data Transport Layer]: Integration Tests', () => {
  let signer: Signer
  before(async () => {
    ;[signer] = await ethers.getSigners()
  })

  let Lib_AddressManager: Contract
  let OVM_StateCommitmentChain: Contract
  let OVM_ExecutionManager: Contract
  let OVM_CanonicalTransactionChain: Contract
  beforeEach(async () => {
    Lib_AddressManager = await getContractFactory('Lib_AddressManager')
      .connect(signer)
      .deploy()

    const OVM_ChainStorageContainer__CTC_QUEUE = await getContractFactory(
      'OVM_ChainStorageContainer'
    )
      .connect(signer)
      .deploy(Lib_AddressManager.address, 'OVM_CanonicalTransactionChain')

    const OVM_ChainStorageContainer__CTC_BATCHES = await getContractFactory(
      'OVM_ChainStorageContainer'
    )
      .connect(signer)
      .deploy(Lib_AddressManager.address, 'OVM_CanonicalTransactionChain')

    const OVM_ChainStorageContainer__SCC_BATCHES = await getContractFactory(
      'OVM_ChainStorageContainer'
    )
      .connect(signer)
      .deploy(Lib_AddressManager.address, 'OVM_StateCommitmentChain')

    OVM_CanonicalTransactionChain = await getContractFactory(
      'OVM_CanonicalTransactionChain'
    )
      .connect(signer)
      .deploy(Lib_AddressManager.address, 1_000_000, 1_000_000, 8_000_000)

    OVM_StateCommitmentChain = await getContractFactory(
      'OVM_StateCommitmentChain'
    )
      .connect(signer)
      .deploy(Lib_AddressManager.address, 1_000_000, 1_000_000)

    OVM_ExecutionManager = await getContractFactory('OVM_ExecutionManager')
      .connect(signer)
      .deploy(
        Lib_AddressManager.address,
        {
          minTransactionGasLimit: 0,
          maxTransactionGasLimit: 8_000_000,
          maxGasPerQueuePerEpoch: 1_000_000_000,
          secondsPerEpoch: 0,
        },
        {
          ovmCHAINID: 420,
        }
      )

    await Lib_AddressManager.setAddress(
      'OVM_ChainStorageContainer:CTC:queue',
      OVM_ChainStorageContainer__CTC_QUEUE.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_ChainStorageContainer:CTC:batches',
      OVM_ChainStorageContainer__CTC_BATCHES.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_ChainStorageContainer:SCC:batches',
      OVM_ChainStorageContainer__SCC_BATCHES.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_CanonicalTransactionChain',
      OVM_CanonicalTransactionChain.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_StateCommitmentChain',
      OVM_StateCommitmentChain.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_ExecutionManager',
      OVM_ExecutionManager.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_Sequencer',
      await signer.getAddress()
    )
  })

  let service: L1DataTransportService
  beforeEach(async () => {
    if (service) {
      await service.stop()
      await sleep(1000)
    }

    rimraf.sync(DEFAULT_TEST_OPTIONS.db)

    service = new L1DataTransportService({
      ...DEFAULT_TEST_OPTIONS,
      addressManager: Lib_AddressManager.address,
    })

    // TODO: We really need better feedback to figure out when the service is started.
    service.start()
    await sleep(1000)
  })

  let client: L1DataTransportClient
  beforeEach(async () => {
    client = new L1DataTransportClient(
      `http://localhost:${DEFAULT_TEST_OPTIONS.port}`
    )
  })

  describe('Handling TransactionEnqueued events', () => {
    for (const enqueues of [1, 2, 4, 8, 16, 32, 64]) {
      it(`should be able to process ${enqueues} TransactionEnqueued event(s)`, async () => {
        const target = '0x1111111111111111111111111111111111111111' // Fixed target address.
        const gasLimit = 5_000_000 // Fixed gas limit.
        const data = '0x' + '12'.repeat(420) // Fixed data size.

        const blocks = []
        for (let i = 0; i < enqueues; i++) {
          const response = await OVM_CanonicalTransactionChain.connect(
            signer
          ).enqueue(target, gasLimit, data)

          const receipt = await response.wait()
          const block = await ethers.provider.getBlock(receipt.blockNumber)
          blocks.push(block)
        }

        await sleep(1000)

        for (let i = 0; i < enqueues; i++) {
          expect(await client.getEnqueueByIndex(i)).to.deep.equal({
            index: i,
            target: target,
            data: data,
            gasLimit: gasLimit,
            origin: await signer.getAddress(),
            blockNumber: blocks[i].number,
            timestamp: blocks[i].timestamp,
          })
        }
      })
    }
  })

  describe('Handling SequencerBatchAppended events', () => {
    for (const numBatches of [1, 2, 4]) {
      for (const batchLength of [1, 2, 4, 8, 16, 32]) {
        it(`should be able to process ${numBatches} batch(es) with ${batchLength} EIP155 *sequencer* transactions(s) per batch`, async () => {
          const DEFAULT_TRANSACTION = {
            sig: {
              r:
                '0x1111111111111111111111111111111111111111111111111111111111111111',
              s:
                '0x2222222222222222222222222222222222222222222222222222222222222222',
              v: 0,
            },
            gasLimit: 5_000_000,
            gasPrice: 0,
            nonce: 0,
            target: '0x3333333333333333333333333333333333333333',
            data: '0x' + '44'.repeat(420),
          }

          const contextBlocks = []
          const batchBlocks = []
          const transactionHashes = []
          for (let i = 0; i < numBatches; i++) {
            const block = await ethers.provider.getBlock('latest')
            contextBlocks.push(block)

            const calldata =
              OVM_CanonicalTransactionChain.interface.getSighash(
                'appendSequencerBatch'
              ) +
              encodeAppendSequencerBatch({
                shouldStartAtBatch: i * batchLength,
                totalElementsToAppend: batchLength,
                contexts: [
                  {
                    numSequencedTransactions: batchLength,
                    numSubsequentQueueTransactions: 0,
                    timestamp: block.timestamp,
                    blockNumber: block.number,
                  },
                ],
                transactions: [...Array(batchLength)].map(() => {
                  return ctcCoder.eip155TxData.encode(DEFAULT_TRANSACTION)
                }),
              })

            const result = await signer.sendTransaction({
              to: OVM_CanonicalTransactionChain.address,
              data: calldata,
            })

            const receipt = await result.wait()
            transactionHashes.push(receipt.transactionHash)
            batchBlocks.push(
              await ethers.provider.getBlock(receipt.blockNumber)
            )
          }

          await sleep(1000)

          for (let i = 0; i < numBatches; i++) {
            for (let j = 0; j < batchLength; j++) {
              // Using `containSubset` here because the `batch.root` property is extremely
              // difficult to calculate on the fly.
              expect(
                await client.getTransactionByIndex(i * batchLength + j)
              ).to.containSubset({
                transaction: {
                  index: i * batchLength + j,
                  batchIndex: i,
                  blockNumber: contextBlocks[i].number,
                  timestamp: contextBlocks[i].timestamp,
                  gasLimit: 8_000_000,
                  target: '0x4200000000000000000000000000000000000005',
                  origin: '0x0000000000000000000000000000000000000000',
                  data: ctcCoder.eip155TxData.encode(DEFAULT_TRANSACTION),
                  queueOrigin: 'sequencer',
                  type: 'EIP155',
                  queueIndex: null,
                  decoded: DEFAULT_TRANSACTION,
                },
                batch: {
                  index: i,
                  size: batchLength,
                  prevTotalElements: i * batchLength,
                  extraData: '0x',
                  blockNumber: batchBlocks[i].number,
                  timestamp: batchBlocks[i].timestamp,
                  submitter: await signer.getAddress(),
                  l1TransactionHash: transactionHashes[i],
                },
              })
            }
          }
        })
      }
    }
  })
})
