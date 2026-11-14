
import { ethers } from 'ethers'

export const CONTRACT_ADDRESS =
  '0x0937b4E75bE867718EaE1Bd8F7a9ADaa2a7c2926'

export const NETWORK = {
  chainId: '0x164ce',
  chainName: 'GIWA Sepolia',
  nativeCurrency: {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: ['https://sepolia-rpc.giwa.io'],
  blockExplorerUrls: ['https://sepolia-explorer.giwa.io']
}

export const ABI = [
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
  'function tokenCount() view returns (uint256)',
  'function tokenAt(uint256) view returns (address)',
  'function instantCreationFee() view returns (uint256)',
  'function fundraiseCreationFee() view returns (uint256)',
  'function createInstant(string,string,string,uint256,uint16) payable returns (address)',
  'function buy(address,uint256) payable',
  'function sell(address,uint256,uint256) payable',
  'function quoteBuy(address,uint256) view returns (uint256)',
  'function quoteSell(address,uint256) view returns (uint256)',
]

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('Please install MetaMask')
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: NETWORK.chainId }]
    })
  } catch (error) {
    if (error.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [NETWORK]
      })
    } else {
      throw error
    }
  }

  const provider = new ethers.BrowserProvider(window.ethereum)
  await provider.send('eth_requestAccounts', [])

  const signer = await provider.getSigner()
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    ABI,
    signer
  )

  return {
    address: await signer.getAddress(),
    provider,
    signer,
    contract
  }
}
