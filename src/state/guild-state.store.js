class GuildStateStore {
  constructor() {
    this.data = new Map();
  }

  ensure(guildId) {
    if (!this.data.has(guildId)) {
      this.data.set(guildId, {
        autoplay: false,
        autoplayHistory: [],
        autoplayFilling: false,
        autoplayGeneration: 0,
        autoplayFillingGeneration: 0,
        queueClearInProgress: false,
        currentTrackInfo: null,
        playerMessage: null,
      });
    }
    return this.data.get(guildId);
  }

  get(guildId) {
    return this.ensure(guildId);
  }

  clear(guildId) {
    this.data.delete(guildId);
  }
}

export default new GuildStateStore();
