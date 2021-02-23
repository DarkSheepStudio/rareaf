/* eslint-disable no-console */
'use strict'

const React = require('react')
import {Card} from '@blueprintjs/core'
import {listTokens, getTokenMetadata} from './algorand'

class Browser extends React.Component {
  constructor(props) {
        super(props)

        this.state = {
            token_prefix: "RareAF",
            tokens:[],
            metas:[]
        }
        this.getTokens = this.getTokens.bind(this)

        this.getTokens()
    }

    async getTokens(){
        let tokens = await listTokens()
        this.setState({tokens:tokens})
        let notes = []
        for (const idx in tokens){
            let token = tokens[idx]
            console.log(token)
            let meta = await getTokenMetadata(token['index'], token['created-at-round'])
            notes.push(meta)
        }
        this.setState({metas:notes})
    }


    render() {
        console.log(this.state.metas)
        return (
        <div className='container' >
            
            { this.state.metas.map((m,i) => {     
                // Return the element. Also pass key     
                const idx = this.state.tokens[i]['index']
                return (
                    <Card className='content-card' key={idx} >
                        <div className='container'>
                            <a href={'/raf/'+idx}>
                                <img src='http://via.placeholder.com/550'></img>
                            </a>
                        </div>
                        <div className='container'>
                            <p><a href={'/raf/'+idx}> <b>{m.title}</b> - <i>{m.artist}</i></a></p>
                        </div>
                        <div className='container'>
                            <p>{m.description}</p>
                        </div>
                    </Card> 
                ) 
                    //    <img src={'http://ipfs.io/ipfs/'+m.file_hash} />
            })}
        </div>
        )

    }
}
module.exports = Browser