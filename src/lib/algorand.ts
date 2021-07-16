/* eslint-disable no-console */
import {  resolveMetadataFromMetaHash } from "./ipfs";
import {platform_settings as ps} from './platform-conf'
import algosdk from 'algosdk'  
import Listing from "./listing";
import {NFT} from "./nft";
import {TagToken} from './tags'
import { Tag } from "@blueprintjs/core";
import {dummy_addr, dummy_id} from './contracts'
import { NetworkToaster, showNetworkError, showNetworkSuccess, showNetworkWaiting } from "../Toaster";

let client = undefined;
export function getAlgodClient(){
    if(client===undefined){
        const {token, server, port} = ps.algod
        client = new algosdk.Algodv2(token, server, port)
    }
    return client
}

let indexer = undefined;
export function getIndexer() {
    if(indexer===undefined){
        const {token, server, port} = ps.indexer
        indexer = new algosdk.Indexer(token, server, port)
    }
    return indexer
}

export async function getTags(): Promise<TagToken[]> {
    const indexer = getIndexer()
    const tags = await indexer
        .searchForAssets()
        .creator(ps.application.owner_addr)
        .unit(TagToken.getUnitName())
        .do()

    return tags.assets.map((t)=>{
        return new TagToken(t.params.name, t.index)
    })
}

export async function isOptedIntoApp(address: string): Promise<boolean> {
    const client = getAlgodClient()
    const result = await client.accountInformation(address).do()

    const optedIn = result['apps-local-state'].find((r)=>{ return r.id == ps.application.app_id })

    return optedIn !== undefined 
}

export async function isOptedIntoAsset(address: string, idx: number): Promise<boolean> {
    const client = getAlgodClient()
    const result = await client.accountInformation(address).do()

    console.log(result)
    const optedIn = result['assets'].find((r)=>{ return r['asset-id'] == idx })

    return optedIn !== undefined 
}

export async function getListings(tagName: string): Promise<Listing[]> {
    const indexer  = getIndexer()

    let token_id = ps.application.price_id

    if(tagName !== undefined){
        const tag = new TagToken(tagName)
        const tt = await getTagToken(tag.getTokenName())
        if (tt.id == 0) return []
        token_id = tt.id
    }

    const balances =  await indexer.lookupAssetBalances(token_id).currencyGreaterThan(0).do()

    let listings = []
    for (let bidx in balances.balances) {
        const b = balances.balances[bidx]

        if (b.address == ps.application.owner_addr || b.amount == 0) continue;

        listings.push(await getListing(b.address))
    }

    return listings
}

export async function getTagToken(name: string): Promise<TagToken> {
    const indexer  = getIndexer()
    const assets = await indexer.searchForAssets().name(name).do()

    for(let aidx in assets.assets){
        if(assets.assets[aidx].params.creator == ps.application.owner_addr)
            return new TagToken(name, assets.assets[aidx].index)
    }

    return new TagToken(name)
}

type Portfolio = {
    listings: Listing[]
    nfts: NFT[]
}

export async function getPortfolio(addr: string): Promise<Portfolio> {
    const indexer = getIndexer()
    const balances = await indexer.lookupAccountByID(addr).do()
    const acct = balances.account

    const listings = []
    for(let aidx in acct['apps-local-state']){
        const als = acct['apps-local-state'][aidx]
        if(als.id !== ps.application.app_id) continue

        for(let kidx in als['key-value']) {
            const kv = als['key-value'][kidx]
            listings.push(await getListing(b64ToAddr(kv.key)))
        }
    }

    const nfts = []
    for(let aidx in acct['assets']) {
        const ass = acct['assets'][aidx]
        if (ass.amount !== 1) continue

        const nft = await tryGetNFT(ass['asset-id'])
        if (nft  !== undefined) nfts.push(nft)
    }

    return { listings:listings, nfts:nfts } 
}

export async function getListing(addr: string): Promise<Listing> {
    const holdings  = await getHoldingsFromListingAddress(addr)
    const creator   = await getCreator(addr, holdings.nft.asset_id)


    let l = new Listing(holdings.price, holdings.nft.asset_id, creator, addr)
    l.tags = holdings.tags
    l.nft = holdings['nft']

    return l
}

type Holdings= {
    price: number
    tags: TagToken[]
    nft: NFT
};


export async function getHoldingsFromListingAddress(address: string): Promise<Holdings> {
    const client   = getAlgodClient()
    const account = await client.accountInformation(address).do()
    const holdings  = { 'price':0, 'tags':[], 'nft':undefined, }

    for (let aid in account.assets) {
        const asa = account.assets[aid]

        if(asa['asset-id'] == ps.application.price_id){
            holdings.price = asa['amount']
            continue
        }

        const token = await getToken(asa['asset-id'])

        if(token.params.creator == ps.application.owner_addr) holdings.tags.push(TagToken.fromAsset(token))
        else holdings.nft = await NFT.fromAsset(token)

    }

    return holdings
}

export async function tryGetNFT(asset_id: number): Promise<NFT> {
    try {
        const token = await getToken(asset_id)
        // Make sure its a real nft
        const nft = await NFT.fromAsset(token)
        return nft
    } catch (error) { console.error("invalid nft: ", asset_id) }

    return undefined 
}

export async function getToken(asset_id: number): Promise<any> {
    const client = getAlgodClient()
    return await client.getAssetByID(asset_id).do()
}

export async function getCreator(addr: string, asset_id: number): Promise<string> {
    // Find the txn that xfered the asa to this addr, sender is creator
    const indexer = getIndexer()
    const txns = await indexer
        .searchForTransactions()
        .address(addr)
        .currencyGreaterThan(0)
        .assetID(asset_id)
        .do()

    for(let idx in txns.transactions){
        const txn = txns.transactions[idx]
        if(txn.sender != addr){
            return txn.sender
        }
    }
}


export function get_asa_cfg_txn(suggestedParams, from, asset, new_config) {
    return  {
        from: from,
        assetIndex: asset,
        type: 'acfg',
        ...new_config,
        ...suggestedParams
    }
}

export function get_cosign_txn(suggestedParams, from) {
    return {
        from: from,
        to: from,
        type: 'pay',
        amount: 0,
        ...suggestedParams,
        fee:suggestedParams.fee * 2
    }
}

export function get_pay_txn(suggestedParams, from, to, amount) {
    return {
        from: from,
        to: to,
        type: 'pay',
        amount: amount,
        ...suggestedParams
    }
}

export function get_asa_optin_txn(suggestedParams, addr, id) {
    return get_asa_xfer_txn(suggestedParams, addr, addr, id, 0)
}

export function get_asa_xfer_txn(suggestedParams, from, to, id, amt) {
    return {
        from: from,
        to: to,
        assetIndex: id,
        type: 'axfer',
        amount: amt,
        ...suggestedParams
    }
}

export function get_asa_create_txn(suggestedParams, addr, url) {
    return  {
        from: addr,
        assetURL: url,
        assetManager: addr,
        assetReserve: addr,
        assetClawback: addr,
        assetFreeze: addr,
        assetTotal: 1,
        assetDecimals: 0,
        type: 'acfg',
        ...suggestedParams
    }
}

export function get_asa_destroy_txn(suggestedParams, addr, token_id) {
    return {
        from: addr, 
        assetIndex: token_id, 
        type: 'acfg' ,
        ...suggestedParams
    }
}


export function get_app_optin_txn(suggestedParams, addr, id) {
    return {
        from: addr,
        appIndex:id,
        type: 'appl',
        appOnComplete: algosdk.OnApplicationComplete.OptInOC,
        ...suggestedParams
    }
}
export function get_app_create_txn(suggestedParams, addr, approval, clear) {
   return {
        from:addr,
        type:'appl',
        appLocalByteSlices: 16,
        appApprovalProgram: approval,
        appClearProgram: clear,
        ...suggestedParams
   } 
}

export function get_app_update_txn(suggestedParams, addr, approval, clear, id) {
   return {
        from:addr,
        appIndex: id,
        type:'appl',
        numLocalByteSlices: 16,
        appOnComplete: algosdk.OnApplicationComplete.UpdateApplicationOC,
        appApprovalProgram: approval,
        appClearProgram: clear,
        ...suggestedParams
   } 
}

export function get_app_call_txn(suggestedParams, addr, args) {
    return {
        from: addr,
        appArgs:args.map((a)=>{ return new Uint8Array(Buffer.from(a, 'base64'))}),
        appIndex:ps.application.app_id,
        appOnComplete: algosdk.OnApplicationComplete.NoOpOC,
        type:"appl",
        ...suggestedParams
    }
}

export async function getSuggested(rounds){
    const client = getAlgodClient();
    const txParams = await client.getTransactionParams().do();
    return { ...txParams, lastRound: txParams['firstRound'] + rounds }
}


export function uintToB64(x: number): string {
    return Buffer.from(algosdk.encodeUint64(x)).toString('base64')
}

export function addrToB64(addr: string): string {
    if (addr == "" ){
        return dummy_addr
    }
    try {
        const dec = algosdk.decodeAddress(addr)
        return "b64("+Buffer.from(dec.publicKey).toString('base64')+")"
    }catch(err){
        return dummy_addr
    }
}
export function b64ToAddr(x){
    return algosdk.encodeAddress(new Uint8Array(Buffer.from(x, "base64")));
}

export async function sendWait(signed: any[]) {
    const client = getAlgodClient()

    if(ps.dev.debug_txns) download_txns("grouped.txns", signed.map((t)=>{return t.blob}))

    const {txId}  = await client.sendRawTransaction(signed.map((t)=>{return t.blob})).do()
    showNetworkWaiting(txId)

    try {
        const result = await waitForConfirmation(client, txId, 3)
        showNetworkSuccess(txId)
        return result 
    } catch (error) { showNetworkError(txId, error) }
    return false
}


export async function waitForConfirmation(algodclient, txId, timeout) {
    if (algodclient == null || txId == null || timeout < 0) {
      throw new Error('Bad arguments.');
    }

    const status = await algodclient.status().do();
    if (typeof status === 'undefined')
      throw new Error('Unable to get node status');

    const startround = status['last-round'] + 1;
    let currentround = startround;
  
    /* eslint-disable no-await-in-loop */
    while (currentround < startround + timeout) {
      const pending = await algodclient
        .pendingTransactionInformation(txId)
        .do();

      if (pending !== undefined) {
        if ( pending['confirmed-round'] !== null && pending['confirmed-round'] > 0) 
          return pending;
  
        if ( pending['pool-error'] != null && pending['pool-error'].length > 0) 
          throw new Error( `Transaction Rejected pool error${pending['pool-error']}`);
      }

      await algodclient.statusAfterBlock(currentround).do();
      currentround += 1;
    }

    /* eslint-enable no-await-in-loop */
    throw new Error(`Transaction not confirmed after ${timeout} rounds!`);
}

export function download_txns(name, txns) {
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

export function concatTypedArrays(a, b) { // a, b TypedArray of same type
    var c = new (a.constructor)(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}