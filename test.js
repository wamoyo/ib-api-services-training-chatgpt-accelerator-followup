
/*
 * Testing our followup lambda function
 * This Lambda is triggered by EventBridge (cron schedule), not API Gateway
 */

import { handler } from './index.js'

// EventBridge sends a scheduled event (empty object for our use case)
var event = {
  "id": "cdc73f9d-aea9-11e3-9d5a-835b769c0d9c",
  "detail-type": "Scheduled Event",
  "source": "aws.events",
  "time": "1970-01-01T00:00:00Z",
  "region": "us-east-1",
  "resources": [
    "arn:aws:events:us-east-1:204617980925:rule/ai-accelerator-followup-daily"
  ],
  "detail": {}
}

console.log('Testing followup Lambda with EventBridge event...')
handler(event).then(console.log).catch(console.error)
