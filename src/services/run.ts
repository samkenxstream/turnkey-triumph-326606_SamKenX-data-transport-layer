import { L1IngestionService } from './l1-ingestion/service'

const main = async () => {
  const service = new L1IngestionService({
    db: './db',
    addressManager: '0x1De8CFD4C1A486200286073aE91DE6e8099519f1',
    confirmations: 10,
    l1RpcEndpoint: '',
    l1StartingBlock: 11650206,
    pollingInterval: 5000,
    contractParameters: {
      OVM_StateCommitmentChain: [
        {
          address: '0x901a629a72A5daF200fc359657f070b34bBfdd18',
          fromBlock: null,
          toBlock: null,
        },
      ],
    },
  })

  await service.start()
}

main()
