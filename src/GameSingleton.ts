import {RedisClientType} from "redis";

const MOVEMENT_DELAY = 90;
const SCORE_INCREMENT = 100;


export class GameSingleton {
    private static _instance: GameSingleton;
    public games: Map<String, any> = new Map();


    private constructor()
    {
    }

    public static Instance()
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public startNewGame(username: string): any {
        let startingCoin = this.generateNextCoinPosition()
        this.games[username] = {nextCoin: startingCoin, collectedCoins: []}
        return {movementDelay: MOVEMENT_DELAY, scoreIncrement: SCORE_INCREMENT, initialCoinPosition: startingCoin }
    }

    public collectCoin(username: string, x: number, y: number){
        if(this.games[username]){
            let game = this.games[username]
            if(game.nextCoin.x == x && game.nextCoin.y == y){
                game.collectedCoins.push(game.nextCoin)
                game.nextCoin = this.generateNextCoinPosition()
            }
            return game.nextCoin
        }else{
            throw "Unexisting game"
        }
    }

    public finishGame(username: string, deathPoint: {x: number, y: number}, playLog: any[]): number {
        if(this.games[username]){
            let game = this.games[username]
            let isValid = this.validate(game, deathPoint, playLog)
            if(isValid){
                let score = game.collectedCoins.length * SCORE_INCREMENT
                return score
            }else {
                throw "Invalid game"
            }
          }else{
            throw "Unexisting game"
        }
    }

    private validate(game: any, deathPoint: {x: number, y: number}, playLog: any[]){
        console.log(playLog)
        console.log(playLog.filter(i => typeof i == "string").filter(i => i.startsWith('EAT')).length)
        console.log(game.collectedCoins.length)
        //Improve this
        //return game.collectedCoins.length == playLog.filter(i => typeof i == "string").filter(i => i.startsWith('EAT')).length
        return true
    }

    private generateNextCoinPosition(){
        const x = this.getRandomInt(23);
        const y =  this.getRandomInt( 18);
        return {x, y}
    }

    private getRandomInt(max) {
        return Math.floor(Math.random() * (max + 1));
    }


}