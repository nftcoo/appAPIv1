// NFT Contract Address
export const NFT_CONTRACT_ADDRESS = '0x03f5CeE0d698c24A42A396EC6BDAEe014057d4c8';

// Ethereum RPC URL (e.g., Infura, Alchemy, or local node)
export const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.public.blastapi.io';

// NFT Contract ABI - Minimal ABI for balanceOf function
export const NFT_CONTRACT_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
    'function tokenURI(uint256 tokenId) view returns (string)'
]; 