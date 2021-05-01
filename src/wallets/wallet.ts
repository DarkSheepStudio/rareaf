import {TransactionParams} from 'algosdk';

export interface SignedTxn {
    txID: string;
    blob: Uint8Array;
}

export interface Wallet {
    accounts: Array<string>;
    default_account: number;
    network: string;

    connect(): Promise<boolean>;
    isConnected(): boolean;

    getDefaultAccount(): string;

    sign(txn: TransactionParams): Promise<SignedTxn>;
    signBytes(b: Uint8Array): Promise<Uint8Array>;
    signTeal(teal: Uint8Array): Promise<Uint8Array>;
}