import express from 'express';
import 'websocket-polyfill'
import bodyParser from "body-parser";
import {createClient, RedisClientType} from 'redis';
import {RedisClientSingleton} from "./RedisClientSingleton";
import * as openpgp from 'openpgp';
import sha256 from 'sha256';
import {GameSingleton} from "./GameSingleton";
import schedule from 'node-schedule-tz'
import cors from 'cors'
import base64 from 'base-64'

require('dotenv').config()

const app = express();

const options = {
    origin: 'http://localhost:4200',
}
app.use(cors(options))

const port = Number(process.env.PORT) || 3333;

const client: RedisClientType = createClient({
    url: process.env.REDIS_URL
});

client.on('error', err => console.log('Redis Client Error', err));

client.connect();

RedisClientSingleton.Instance(client)

app.use(bodyParser.json({limit: '20mb'}));

app.get('/signUp', (req: any, res) => {
    RedisClientSingleton.Instance().userExists(req.query.username).then(userExists => {
        if(userExists){
            res.status(500).send({message: "Username already exists"})
        }else{
            openpgp.generateKey({
                type: 'rsa', // Type of the key
                rsaBits: 2047, // RSA key size (defaults to 4096 bits)
                userIDs: [{ name: req.query.username as string }]
            }).then(keys => {
                let response = {...keys, pubKeyHash: sha256(keys.publicKey)}
                return RedisClientSingleton.Instance().addUser(req.query.username, keys.publicKey).then(() => {
                    res.send(response)
                }).catch(e => {
                    console.log(e)
                    res.status(500).send({message: "failure to sign up "+ e})
                })
            })
        }
    })

})

app.post('/signIn', (req:  express.Request , res: express.Response) => {
    authenticateAndRun(req, res, (req, res) => {
        res.send({message: 'Success'})
    });
});

app.post('/startGame', (req, res) => {
    authenticateAndRun(req, res, (req, res, username) => {
        res.send(GameSingleton.Instance().startNewGame(username))
    });
});

app.post('/collectCoin', (req, res) => {
    authenticateAndRun(req, res, (req, res, username) => {
        res.send(GameSingleton.Instance().collectCoin(username, req.body.x, req.body.y))
    });
});

app.post('/finishGame', (req, res) => {
    authenticateAndRun(req, res, (req, res, username) => {
        const {deathPoint, playLog} = req.body;

        try {
            let score = GameSingleton.Instance().finishGame(username, deathPoint, playLog)
            RedisClientSingleton.Instance().addScore(username, score).then(r => {
                res.send({message:"Success"})
            }).catch(e => {
                res.status(500).send({message: e} )
            })
        }catch (e) {
            res.status(500).send({message: e})
        }

    });
});

function authenticateAndRun(req: express.Request, res: express.Response, callback: (req: express.Request, res: express.Response, username: string) => void) {
    const {username, pubKeyHash} = req.body;

    if ((username as string).length > 20 || (pubKeyHash as string).length > 64) {
        res.status(500).send({message: 'Invalid input'})
        return
    }

    const userKey = 'users.' + username

    RedisClientSingleton.Instance().client.get(userKey).then(storedPublicKey => {
        if (sha256(storedPublicKey) !== pubKeyHash) {
            res.status(500).send({message: "User not found"})
        } else {
            callback(req, res, username)
        }
    }).catch(e => {
        res.status(500).send({message: "public key not found "+ e})
    })
}

app.get('/leaderboard', (req: any, res) => {
    RedisClientSingleton.Instance().getLeaderboard().then(leaderboard => {
        res.send(leaderboard)
    }).catch(e => res.status(500).send({message: e}))
})

app.post('/addToken', (req: any, res) => {
    const {counter, token} = req.body;
    RedisClientSingleton.Instance().client.set("tokens."+counter, token).then(r => {
        res.send({message: 'Success'})
    })

})

app.get('/prize', (req: any, res) => {
    RedisClientSingleton.Instance().client.get("prize").then(prize => {
        res.send(JSON.parse(prize))
    }).catch(e => res.status(500).send({message: e}))
})

schedule.scheduleJob('pay-the-prize','0 9 * * *', 'UTC', () => {
    console.log('Calculating prize')
    RedisClientSingleton.Instance().getLeader().then(leader => {
        if(leader) {
            RedisClientSingleton.Instance().consumeToken().then(async token => {
                const publicKey = await openpgp.readKey({armoredKey: leader.publicKey});
                const encrypted = await openpgp.encrypt({
                    message: await openpgp.createMessage({ text: token }), // input as Message object
                    encryptionKeys: publicKey
                });

                RedisClientSingleton.Instance().client.set("prize", `{"username": "${leader.username}", "payload": "${base64.encode(encrypted)}"}`)
                RedisClientSingleton.Instance().client.keys("scores.*").then(keys => {
                    keys.forEach(key => {
                        RedisClientSingleton.Instance().client.del(key)
                    })

                })

            }).catch(e => console.log("Error: on token consumption "+ e))
        }
    })
})

app.get('/ping', (req: any, res) => {
    res.send({message: 'pong!'})
})


app.listen(port, '0.0.0.0',0,() => {
     console.log(`server is listening on ${port}`);
});