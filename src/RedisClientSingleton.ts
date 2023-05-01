import {RedisClientType} from "redis";
import {enums} from "openpgp";
import publicKey = enums.publicKey;
import sha256 from "sha256";

export class RedisClientSingleton {
    private static _instance: RedisClientSingleton;
    public client: RedisClientType;

    private constructor(client: RedisClientType)
    {
        this.client = client
    }

    public static Instance(client: RedisClientType = null)
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this(client));
    }

    public userExists(username: string): Promise<boolean> {
        return this.client.get("users."+username).then(result => {
            return result != null
        })
    }

    public deleteUser(username: string, pubKeyHash: string): Promise<any> {
        return this.client.get("users."+username).then(result => {
            if(pubKeyHash == sha256(result)){
                return this.client.del("users."+username)
            }
            throw "Invalid user"
        })
    }

    public addUser(username: string, publicKey: string){
        return this.client.set("users."+username, publicKey)
    }

    public getPublicKey(username: string){
        return this.client.get("users."+username)
    }

    public addScore(username: string, score: number) {
        return this.client.get("scores."+username).then(existingScore => {
            if(existingScore == null || Number.parseInt(existingScore) < score){
                return this.client.set("scores."+username, score)
            }
        })
    }

    public getLeaderboard(){
        return this.client.keys("scores.*").then(keys => {
            return keys.map(key => {
                let username = key.split(".")[1]
                return this.client.get(key).then(score => {
                    return {username, score}
                })
            })
        }).then(leaderboard => {
            return Promise.all(leaderboard).then(r => {
                return r.sort((a: any, b: any) => b.score - a.score)
            })
        })
    }

    public getLeader(){
        return this.getLeaderboard().then(leaderboard => {
            if(leaderboard && leaderboard[0]){
                let username = leaderboard[0].username
                return this.getPublicKey(username).then(publicKey => {
                    return {username, publicKey}
                })
            }else {
                return null
            }
        })

    }

    public consumeToken(){
        return this.client.keys("tokens.*").then(tokenKeys => {
            return this.client.get(tokenKeys[0]).then(existingToken => {
                return this.client.del(tokenKeys[0]).then(r => {
                    return existingToken
                })
            })
        })
    }
}