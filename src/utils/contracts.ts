/* Imports: External */
import { Contract, Signer } from 'ethers'
import { JsonRpcProvider } from '@ethersproject/providers'
import { getContractInterface } from '@eth-optimism/contracts/build/src/contract-defs'
import fetch from 'node-fetch'

/* Imports: Internal */
import { ZERO_ADDRESS } from './constants'

export const loadContract = (
  name: string,
  address: string,
  provider: JsonRpcProvider
): Contract => {
  return new Contract(address, getContractInterface(name) as any, provider)
}

export const loadContractFromManager = async (
  name: string,
  Lib_AddressManager: Contract,
  provider: JsonRpcProvider
): Promise<Contract> => {
  const address = await Lib_AddressManager.getAddress(name)

  if (address === ZERO_ADDRESS) {
    throw new Error(
      `Lib_AddressManager does not have a record for a contract named: ${name}`
    )
  }

  return loadContract(name, address, provider)
}

export const loadProxyFromManager = async (
  name: string,
  proxy: string,
  Lib_AddressManager: Contract,
  provider: JsonRpcProvider
): Promise<Contract> => {
  const address = await Lib_AddressManager.getAddress(proxy)

  if (address === ZERO_ADDRESS) {
    throw new Error(
      `Lib_AddressManager does not have a record for a contract named: ${proxy}`
    )
  }

  return loadContract(name, address, provider)
}

export interface OptimismContracts {
  OVM_StateCommitmentChain: Contract
  OVM_CanonicalTransactionChain: Contract
  OVM_FraudVerifier: Contract
  OVM_ExecutionManager: Contract
  OVM_L1CrossDomainMessenger: Contract
}

export const loadOptimismContracts = async (
  l1RpcProvider: JsonRpcProvider,
  addressManagerAddress: string,
  signer?: Signer
): Promise<OptimismContracts> => {
  const Lib_AddressManager = await loadContract(
    'Lib_AddressManager',
    addressManagerAddress,
    l1RpcProvider
  )

  const inputs = [
    {
      name: 'OVM_StateCommitmentChain',
      interface: 'iOVM_StateCommitmentChain',
    },
    {
      name: 'OVM_CanonicalTransactionChain',
      interface: 'iOVM_CanonicalTransactionChain',
    },
    {
      name: 'OVM_FraudVerifier',
      interface: 'iOVM_FraudVerifier',
    },
    {
      name: 'OVM_ExecutionManager',
      interface: 'iOVM_ExecutionManager',
    },
    {
      name: 'OVM_L1CrossDomainMessenger',
      interface: 'iOVM_L1CrossDomainMessenger',
    },
  ]

  const l2Inputs = [
    {
      name: 'OVM_L2CrossDomainMessenger',
      interface: 'iOVM_L2CrossDomainMessenger',
    },
  ]

  const contracts = {}
  for (const input of inputs) {
    contracts[input.name] = await loadProxyFromManager(
      input.interface,
      input.name,
      Lib_AddressManager,
      l1RpcProvider
    )

    if (signer) {
      contracts[input.name] = contracts[input.name].connect(signer)
    }
  }

  // TODO: sorry
  return contracts as OptimismContracts
}

export interface SynthetixContracts {
  l1: {
    SynthetixBridgeToOptimism: Contract
  }

  l2: {
    SynthetixBridgeToBase: Contract
    TradingRewards: Contract
    RewardEscrow: Contract
    ProxyERC20: Contract
  }
}

const loadSynthetixContract = (
  snxJson: any,
  name: string,
  provider: JsonRpcProvider
): Contract => {
  return new Contract(
    snxJson.targets[name].address,
    snxJson.sources[name].abi,
    provider
  )
}

export const loadSynthetixContracts = async (
  l1RpcProvider: JsonRpcProvider,
  l2RpcProvider: JsonRpcProvider,
  snxL1JsonUrl: string,
  snxL2JsonUrl: string,
  signer?: Signer
): Promise<SynthetixContracts> => {
  const snxL1Json = await (await fetch(snxL1JsonUrl)).json()
  const snxL2Json = await (await fetch(snxL2JsonUrl)).json()

  return {
    l1: {
      SynthetixBridgeToOptimism: loadSynthetixContract(
        snxL1Json,
        'SynthetixBridgeToOptimism',
        l1RpcProvider
      ),
    },
    l2: {
      SynthetixBridgeToBase: loadSynthetixContract(
        snxL2Json,
        'SynthetixBridgeToBase',
        l2RpcProvider
      ),
      TradingRewards: loadSynthetixContract(
        snxL2Json,
        'TradingRewards',
        l2RpcProvider
      ),
      RewardEscrow: loadSynthetixContract(
        snxL2Json,
        'RewardEscrow',
        l2RpcProvider
      ),
      ProxyERC20: loadSynthetixContract(snxL2Json, 'ProxyERC20', l2RpcProvider),
    },
  }
}
