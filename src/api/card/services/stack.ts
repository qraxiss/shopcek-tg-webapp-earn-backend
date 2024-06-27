import { Strapi } from "@strapi/strapi";
import moment from "moment";

export default ({ strapi }: { strapi: Strapi }) => ({
  async start(userId) {
    const status = await strapi.service("api::card.stack").status(userId);

    if (!status.canStartMining && status.canClaim) {
      throw new Error("You have to claim first!");
    }

    if (!status.canStartMining && status.isWaiting) {
      throw new Error(
        `Your mining still ongoing. ${status.remainTime} seconds left!`
      );
    }

    const updatedStack = await strapi.db.query("api::card.stack").update({
      where: {
        userId,
      },
      data: {
        time: new Date(),
      },
    });

    return updatedStack;
  },

  async status(userId) {
    let stack = await strapi.db.query("api::card.stack").findOne({
      where: {
        userId,
      },
    });

    if (!stack) {
      stack = strapi.entityService.create("api::card.stack", {
        data: {
          userId,
        },
      });
    }

    if (!stack.time) {
      return {
        canClaim: false,
        canStartMining: true,
        isWaiting: false,
        remainTime: null,
      };
    }

    const stackTime = moment(stack.time);
    const currentTime = moment();
    const remainTime = 10 - currentTime.diff(stackTime, "seconds");

    if (remainTime >= 0) {
      return {
        canClaim: false,
        canStartMining: false,
        isWaiting: true,
        remainTime,
      };
    } else {
      return {
        canClaim: true,
        canStartMining: false,
        isWaiting: false,
        remainTime: null,
      };
    }
  },

  async claim(userId) {
    const status = await strapi.service("api::card.stack").status(userId);

    if (!status.canClaim && status.isWaiting) {
      throw new Error(
        `Your mining still ongoing. ${status.remainTime} seconds left!`
      );
    }

    if (!status.canClaim && status.canStartMining) {
      throw new Error("You already claimed your reward.");
    }

    const updatedStack = await strapi.db.query("api::card.stack").update({
      where: {
        userId,
      },
      data: {
        time: null,
      },
    });

    const earnPerHour = await strapi
      .service("api::card.level")
      .calculateEarnPerHour(userId);
    const xp = await strapi.service("api::xp.xp").findPoint(userId);
    const inc = await strapi
      .service("api::xp.xp")
      .increase(xp.id, earnPerHour * 4);
    return {
      updatedStack,
      inc,
    };
  },
});