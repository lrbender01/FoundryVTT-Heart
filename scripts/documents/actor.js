export class HeartActor extends Actor {
    get class() {
        return this.itemTypes.class[0];
    }

    get calling() {
        return this.itemTypes.calling[0];
    }

    get activeBeatOne() {
        return this.itemTypes.beat[0];
    }

    get activeBeatTwo() {
        return this.itemTypes.beat[1];
    }
}