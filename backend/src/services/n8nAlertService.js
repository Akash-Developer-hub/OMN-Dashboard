"use strict";

const axios = require("axios");
const logger = require("../../logs_/logger");

const N8N_WEBHOOK_URL = "https://sandbox.vmmaps.com/n8n/webhook/mail-auto";

class N8nAlertService {
  static async sendAlert(payload) {
    try {
      if (!payload?.to || !payload?.services || !payload?.timestamp) {
        throw new Error("Invalid alert payload.");
      }  
      console.log("Payload",payload);
      logger.debug("payload", payload);
      const response = await axios.post(
        N8N_WEBHOOK_URL, 
        payload, 
       );

      logger.info("n8n alert webhook triggered successfully.", {
        payload,
        status: response.status,
        data: response.data,
      });

      return response.data;
    } catch (error) {
      logger.error("Failed to trigger n8n alert webhook.", {
        error: error.message,
        response: error.response?.data,
      });

      throw error;
    }
  }
}

module.exports = N8nAlertService;