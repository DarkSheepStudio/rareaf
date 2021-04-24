import {platform_settings as ps} from './platform-conf'
import listing_template from '../contracts/listing.teal.tmpl'
import platform_delegate from '../contracts/platform.teal'
import platform_delegate_signed from '../contracts/platform.signed'
import { get_asa_cfg, get_teal, get_pay_txn, get_optin_txn, sign, send, populate_contract, get_asa_txn } from './algorand'

const Buffer = require('buffer/').Buffer

import 'algosdk';


export async function getClient(){
    const {token, server, port} = ps.algod
    return new algosdk.Algodv2(token, server, port)
}

export async function create_platform() {
    // If platform settings are empty this can get called

    // Create token with name and units
    // Create Delegated sig to give out this token
    // save
    return
}

export function encodeUint64(num) {
    const buf = Buffer.allocUnsafe(8);
    buf.writeBigUInt64BE(BigInt(num));
    return new Uint8Array(buf);
}

export async function createListing (creator_addr, price, asset_id) {
    const client = await getClient()

    // Encode vars for inclusion in contract
    const var_price = Buffer.from(encodeUint64(price)).toString('base64')
    const var_id    = Buffer.from(encodeUint64(asset_id)).toString('base64')
    const var_addr  = Buffer.from(algosdk.decodeAddress(creator_addr).publicKey).toString('base64')

    const vars = {
        TMPL_PLATFORM_ID      : ps.token.id,
        TMPL_PLATFORM_FEE     : ps.fee,
        TMPL_PLATFORM_ADDR    : ps.address,

        TMPL_PRICE_MICROALGOS : `base64(${var_price})`,
        TMPL_ASSET_ID         : `base64(${var_id})`,
        TMPL_CREATOR_ADDR     : `base64(${var_addr})`
    }

    //Swap tmpl vars for actual values
    const populated_program = await populate_contract(listing_template, vars)

    // Compile program, create logic sig 
    const compiled_program  = await client.compile(populated_program).do();
    const contract_addr     = compiled_program.hash

    // Make logic sig for listing contract
    const program_bytes     = new Uint8Array(Buffer.from(compiled_program.result , "base64"));
    const lsig              = algosdk.makeLogicSig(program_bytes);   


    /// Initialize listing
    //console.log("Seeding contract acct")
    //let seed_txn = await get_pay_txn(creator_addr, contract_addr, ps.seed)
    //seed_txn = await sign(seed_txn)
    //await send(seed_txn)

    //console.log("Opting contract acct into nft")
    //let nft_optin = await get_optin_txn(contract_addr, asset_id)
    //nft_optin = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject(nft_optin)
    //nft_optin = algosdk.signLogicSigTransactionObject(nft_optin, lsig);
    //await client.sendRawTransaction(nft_optin.blob).do()
    //console.log("Opted in")

    //console.log("Opting contract acct into platform")
    //let platform_optin = await get_optin_txn(contract_addr, ps.token.id)
    //platform_optin = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject(platform_optin)
    //platform_optin = algosdk.signLogicSigTransactionObject(platform_optin, lsig);
    //await client.sendRawTransaction(platform_optin.blob).do()
    //console.log("Opted in")


    //// Fund listing

    //const delegate_program      = await get_teal(platform_delegate)
    //const compiled_delegate     = await client.compile(delegate_program).do()
    //const delegate_program_bytes= new Uint8Array(Buffer.from(compiled_delegate.result , "base64"));

    const compiled_bytes        = await get_teal(platform_delegate_signed)
    const delegate_program_bytes= new Uint8Array(Buffer.from(compiled_bytes , "base64"));
    const del_sig               = algosdk.logicSigFromByte(delegate_program_bytes)
    del_sig.args                = [ new Uint8Array(Buffer.from(var_price, "base64")), 
                                    new Uint8Array(Buffer.from(var_id, "base64")), 
                                    new Uint8Array(Buffer.from(program_bytes, "base64")) ]

    let asa_send      = await get_asa_txn(true, creator_addr, contract_addr, asset_id, 1)
    let asa_cfg       = await get_asa_cfg(true, creator_addr, asset_id, {manager:contract_addr, reserve:contract_addr, freeze:contract_addr, clawback:contract_addr})
    let fee_txn       = await get_pay_txn(true, creator_addr, contract_addr, ps.fee)
    let platform_send = await get_asa_txn(true, ps.address, contract_addr, ps.token.id, 1)

    asa_send      = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject(asa_send)
    asa_cfg       = algosdk.makeAssetConfigTxnWithSuggestedParamsFromObject(asa_cfg)
    fee_txn       = algosdk.makePaymentTxnWithSuggestedParamsFromObject(fee_txn)
    platform_send = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject(platform_send)

    const fund_txn_group = [asa_send, asa_cfg, fee_txn, platform_send]
    algosdk.assignGroupID(fund_txn_group)

    const s_asa_send = sign(asa_send, creator_addr)
    const s_asa_cfg = sign(asa_cfg, creator_addr)
    const s_fee_txn = sign(fee_txn, creator_addr)
    const s_platform_send = algosdk.signLogicSigTransactionObject(platform_send, del_sig) 

    const x = [s_asa_send, s_asa_cfg, s_fee_txn, s_platform_send.blob]

    //download_txns("grouped.txns", x)

    console.log(x)
    const {txid} = await client.sendRawTransaction(x).do()
    console.log('Awaiting confirmation (this will take several seconds)...');

    const roundTimeout = 2;
    await utils.waitForConfirmation(client, txId, roundTimeout);
    console.log('Transactions successful.');
}

async function fund_listing(){



}

async function destroy_listing(){
    //const client = algosdk.Algodv2()

    // Send assets and algos back to creator or platform wallet 
    // goal asset send -a 0 -o delist-platform.txn --assetid $PLATFORM_ID -f $CONTRACT_ACCT -t $PLATFORM_ACCT --close-to $PLATFORM_ACCT
    // goal asset send -a 0 -o delist-nft.txn --assetid $NFT_ID -f $CONTRACT_ACCT -t $CREATOR_ACCT --close-to $CREATOR_ACCT 
    // goal clerk send -a 0 -o delist-algo.txn -f $CONTRACT_ACCT -t $CREATOR_ACCT  -F $CONTRACT_NAME  --close-to $CREATOR_ACCT

    // todo: change nft manager back to creator

    // goal clerk group -i delist.txn -o delist.txn.grouped
    // goal clerk sign -i delist.txn.grouped -o delist.txn.grouped.signed -p $CONTRACT_NAME
    // goal clerk rawsend -f delist.txn.grouped.signed
}


async function purchase_listing(){
    //const client = algosdk.Algodv2()
    //  Buyer Opt in to NFT
    //  goal asset send -a 0 --assetid $NFT_ID -f $BUYER_ACCT -t$BUYER_ACCT

    //   Send algos to creator
    //   goal clerk send -a 500 -o purchase-payment.txn -f $BUYER_ACCT -t $CREATOR_ACCT 
    //  
    //   Send NFT to buyer 
    //   goal asset send -a 1 -o purchase-nft.txn --assetid $NFT_ID -f $CONTRACT_ACCT -t $BUYER_ACCT --close-to $BUYER_ACCT
    //  
    //   Send a Platform Token to creator
    //   goal asset send -a 1 -o purchase-platform.txn --assetid $PLATFORM_ID -f $CONTRACT_ACCT -t $CREATOR_ACCT --close-to $PLATFORM_ACCT
    //  
    //   Platform gets fee, rest closes out to creator
    //   goal clerk send -a 100 -o purchase-fee.txn -f $CONTRACT_ACCT -t $PLATFORM_ACCT --close-to $CREATOR_ACCT 
    //  
    //  #Assign Group IDs
    //  ./sandbox goal clerk group -i purchase.txn -o purchase.txn.grouped
    //  
    //  #Sign
    //  ./sandbox goal clerk sign -i purchase-sub-0 -o purchase-sub-0.signed
    //  ./sandbox goal clerk sign -i purchase-sub-1 -o purchase-sub-1.signed -p $CONTRACT_NAME
    //  ./sandbox goal clerk sign -i purchase-sub-2 -o purchase-sub-2.signed -p $CONTRACT_NAME
    //  ./sandbox goal clerk sign -i purchase-sub-3 -o purchase-sub-3.signed -p $CONTRACT_NAME
    // 
    // 
    // ./sandbox goal clerk rawsend -f purchase.tx.signed
}

function translate_txn(o) {
    delete o.name;
    delete o.tag;
    delete o.appArgs;
    o.from = algosdk.encodeAddress(o.from.publicKey)
    o.to = algosdk.encodeAddress(o.to.publicKey)
    return o
}

function download_txns(name, txns) {
    let b = new Uint8Array(0);
    for(const txn in txns){
        b = concatTypedArrays(b, txns[txn])
    }
    var blob = new Blob([b], {type: "application/octet-stream"});

    var link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = name;
    link.click();
}


function concatTypedArrays(a, b) { // a, b TypedArray of same type
    var c = new (a.constructor)(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}
