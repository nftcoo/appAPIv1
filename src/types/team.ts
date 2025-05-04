export interface NFT {
    id: {
        tokenId: string;
    };
    title?: string;
}

export interface TeamName {
    teamId: number;
    title: string;
}

export interface NFTResponse {
    nfts: NFT[];
    tokenIds: string[];
    teamNames?: TeamName[];
}

export interface TeamDetails {
    teamId: number;
    name: string;
    currentBracket?: number;
    currentStage?: number;
    currentScore?: number;
} 