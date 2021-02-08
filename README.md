# @eth-optimism/data-transport-layer

## What is this?

The Optimistic Ethereum Data Transport Layer is a long-running software service (written in TypeScript) designed to reliably index Optimistic Ethereum transaction data from Layer 1 (Ethereum). Specifically, this service indexes:

* Transactions that have been enqueued for submission to the CanonicalTransactionChain via [`enqueue`](https://github.com/ethereum-optimism/contracts-v2/blob/13b7deef60f773241723ea874fc6e81b4003b164/contracts/optimistic-ethereum/OVM/chain/OVM_CanonicalTransactionChain.sol#L225-L231).
* Transactions that have been included in the CanonicalTransactionChain via [`appendQueueBatch`](https://github.com/ethereum-optimism/contracts-v2/blob/13b7deef60f773241723ea874fc6e81b4003b164/contracts/optimistic-ethereum/OVM/chain/OVM_CanonicalTransactionChain.sol#L302-L306) or [`appendSequencerBatch`](https://github.com/ethereum-optimism/contracts-v2/blob/13b7deef60f773241723ea874fc6e81b4003b164/contracts/optimistic-ethereum/OVM/chain/OVM_CanonicalTransactionChain.sol#L352-L354).
* State roots (transaction results) that have been published to the StateCommitmentChain via [`appendStateBatch`](https://github.com/ethereum-optimism/contracts-v2/blob/13b7deef60f773241723ea874fc6e81b4003b164/contracts/optimistic-ethereum/OVM/chain/OVM_StateCommitmentChain.sol#L127-L132).

## How does it work?

We run two sub-services, the [`L1IngestionService`](./src/services/l1-ingestion/service.ts) and the [`L1TransportServer`](./src/services/server/service.ts). The `L1IngestionService` is responsible for querying for the various events and transaction data necessary to accurately index information from our Layer 1 (Ethereum) smart contracts. The `L1TransportServer` simply provides an API for accessing this information.

## HTTP API

This section describes the HTTP API for accessing indexed Layer 1 data.

### Latest Ethereum Block Context

#### Request

```
GET /eth/context/latest
```

#### Response

```json
{
    "blockNumber": number,
    "timestamp": number
}
```

### Enqueue by Index

#### Request

```
GET /enqueue/index/{index: number}
```

#### Response

```json
{
  "index": number,
  "target": string,
  "data": string,
  "gasLimit": number,
  "origin": string,
  "blockNumber": number,
  "timestamp": number
}
```

### Transaction by Index

#### Request

```
GET /transaction/index/{index: number}
```

#### Response

```json
{
    "transaction": {
        "index": number,
        "batchIndex": number,
        "data": string,
        "blockNumber": number,
        "timestamp": number,
        "gasLimit": number,
        "target": string,
        "origin": string,
        "queueOrigin": string,
        "type": string | null,
        "decoded": {
            "sig": {
                "r": string
                "s": string
                "v": string
            },
            "gasLimit": number
            "gasPrice": number
            "nonce": number
            "target": string
            "data": string
        } | null,
        "queueIndex": number | null,
    },
    
    "batch": {
        "index": number,
        "blockNumber": number,
        "timestamp": number,
        "submitter": string,
        "size": number,
        "root": string,
        "prevTotalElements": number,
        "extraData": string
    }
}
```

### Transaction Batch by Index

#### Request

```
GET /batch/transaction/index/{index: number}
```

#### Response

```json
{
    "batch": {
        "index": number,
        "blockNumber": number,
        "timestamp": number,
        "submitter": string,
        "size": number,
        "root": string,
        "prevTotalElements": number,
        "extraData": string
    },
    
    "transactions": [
      {
        "index": number,
        "batchIndex": number,
        "data": string,
        "blockNumber": number,
        "timestamp": number,
        "gasLimit": number,
        "target": string,
        "origin": string,
        "queueOrigin": string,
        "type": string | null,
        "decoded": {
            "sig": {
                "r": string
                "s": string
                "v": string
            },
            "gasLimit": number
            "gasPrice": number
            "nonce": number
            "target": string
            "data": string
        } | null,
        "queueIndex": number | null,
      }
    ]
}
```


### State Root by Index

#### Request

```
GET /stateroot/index/{index: number}
```

#### Response

```json
{
    "stateRoot": {
        "index": number,
        "batchIndex": number,
        "value": string
    },

    "batch": {
        "index": number,
        "blockNumber": number,
        "timestamp": number,
        "submitter": string,
        "size": number,
        "root": string,
        "prevTotalElements": number,
        "extraData": string
    },
}
```

### State Root Batch by Index

#### Request

```
GET /batch/stateroot/index/{index: number}
```

#### Response

```json
{
    "batch": {
        "index": number,
        "blockNumber": number,
        "timestamp": number,
        "submitter": string,
        "size": number,
        "root": string,
        "prevTotalElements": number,
        "extraData": string
    },
    
    "stateRoots": [
        {
            "index": number,
            "batchIndex": number,
            "value": string
        }
    ]
}
```
