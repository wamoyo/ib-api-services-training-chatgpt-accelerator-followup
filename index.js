
/*
 * Daily EventBridge-triggered Lambda for AI Accelerator follow-up emails
 * Sends Email 2 (1 day after application) and Email 3 (7 days after Email 2)
 */

import { readFile } from 'fs/promises'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

var ses = new SESClient({ region: 'us-east-1' })
var dynamoDb = new DynamoDBClient({ region: 'us-east-1' })
var db = DynamoDBDocumentClient.from(dynamoDb)
var replyToAddress = "Innovation Bound <support@innovationbound.com>"

// Pre-calculated scholarship amounts
var scholarshipCalculations = {
  '0': {
    requestedPercent: '0',
    grantedPercent: '0',
    requestedAmount: '$0',
    grantedAmount: '$0',
    fee: '$30,000',
    additionalSeatCost: '$3,000'
  },
  '25': {
    requestedPercent: '25',
    grantedPercent: '30',
    requestedAmount: '$7,500',
    grantedAmount: '$9,000',
    fee: '$21,000',
    additionalSeatCost: '$2,100'
  },
  '50': {
    requestedPercent: '50',
    grantedPercent: '55',
    requestedAmount: '$15,000',
    grantedAmount: '$16,500',
    fee: '$13,500',
    additionalSeatCost: '$1,350'
  },
  '75': {
    requestedPercent: '75',
    grantedPercent: '80',
    requestedAmount: '$22,500',
    grantedAmount: '$24,000',
    fee: '$6,000',
    additionalSeatCost: '$600'
  }
}

export async function handler (event) {
  console.log('EVENT:', JSON.stringify(event))

  try {
    // Query all applications
    var applications = await db.send(new QueryCommand({
      TableName: "www.innovationbound.com",
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "application#ai-accelerator" }
    }))

    console.log(`Found ${applications.Items.length} applications`)

    var now = new Date()
    var email2Count = 0
    var email3Count = 0
    var sesLimit = 14 // SES allows 14 emails/second (sending rate limit)

    // Process each application
    for (let application of applications.Items) {
      var appliedDate = new Date(application.applied)
      var daysSinceApplication = Math.floor((now - appliedDate) / (1000 * 60 * 60 * 24))

      console.log(`Processing ${application.email}: Applied ${daysSinceApplication} days ago`)

      // Email 2: Send 1 day after application (under-promise, over-deliver)
      if (daysSinceApplication >= 1 && !application.email2Sent) {
        try {
          await sendEmail2(application)
          email2Count++
          // Throttle to stay under SES rate limit
          if (email2Count % sesLimit === 0) {
            console.log(`Rate limiting: Sent ${email2Count} emails, pausing 1 second...`)
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        } catch (error) {
          console.error(`Failed to send Email 2 to ${application.email}:`, error.message)
          // Continue processing other applications
        }
      }

      // Email 3: Send 7 days after Email 2 was sent
      if (application.email2Sent && !application.email3Sent) {
        var email2Date = new Date(application.email2Sent)
        var daysSinceEmail2 = Math.floor((now - email2Date) / (1000 * 60 * 60 * 24))

        if (daysSinceEmail2 >= 7) {
          try {
            await sendEmail3(application)
            email3Count++
            // Throttle to stay under SES rate limit
            if (email3Count % sesLimit === 0) {
              console.log(`Rate limiting: Sent ${email3Count} emails, pausing 1 second...`)
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
          } catch (error) {
            console.error(`Failed to send Email 3 to ${application.email}:`, error.message)
            // Continue processing other applications
          }
        }
      }
    }

    console.log(`Sent ${email2Count} Email 2s and ${email3Count} Email 3s`)
    return { statusCode: 200, body: JSON.stringify({ email2Count, email3Count }) }

  } catch (error) {
    console.error('Error:', error)
    throw error
  }
}

// Pure: Calculates deadline date (7 days from now)
function getDeadlineDate () {
  var deadline = new Date()
  deadline.setDate(deadline.getDate() + 7)
  return deadline.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

// Pure: Replaces all template variables in email content
function replaceVariables (content, application, scholarshipInfo, tracking, paymentParams) {
  return content
    .replace(/{{name}}/g, application.name)
    .replace(/{{email}}/g, application.email)
    .replace(/{{website}}/g, application.website)
    .replace(/{{linkedin}}/g, application.linkedin)
    .replace(/{{percentage}}/g, scholarshipInfo.requestedPercent)
    .replace(/{{amount}}/g, scholarshipInfo.requestedAmount)
    .replace(/{{grantedPercentage}}/g, scholarshipInfo.grantedPercent)
    .replace(/{{grantedAmount}}/g, scholarshipInfo.grantedAmount)
    .replace(/{{fee}}/g, scholarshipInfo.fee)
    .replace(/{{additionalSeatCost}}/g, scholarshipInfo.additionalSeatCost)
    .replace(/{{date}}/g, getDeadlineDate())
    .replace(/{{paymentParams}}/g, paymentParams)
    .replace(/{{tracking}}/g, tracking)
    .replace(/{{emailSettings}}/g, `https://www.innovationbound.com/unsubscribe?email=${application.email}`)
}

// Side effect: Sends Email 2 (scholarship notification)
async function sendEmail2 (application) {
  try {
    console.log(`Sending Email 2 to ${application.email}`)

    var scholarshipInfo = scholarshipCalculations[application.assistance]
    if (!scholarshipInfo) {
      throw new Error(`Invalid assistance value: ${application.assistance}`)
    }

    // Tracking params for analytics
    var tracking = `email=${application.email}&list=ai-accelerator-followup&edition=email-2`

    // Payment params for pre-filling form (different names to avoid conflict)
    var paymentParams = `applicant=${encodeURIComponent(application.email)}&name=${encodeURIComponent(application.name)}&scholarshipAmount=${encodeURIComponent(scholarshipInfo.grantedAmount)}&finalFee=${encodeURIComponent(scholarshipInfo.fee)}&seatCost=${encodeURIComponent(scholarshipInfo.additionalSeatCost)}`

    var rawHtml = await readFile("email-2.html", "utf8")
    var rawTxt = await readFile("email-2.txt", "utf8")

    var html = replaceVariables(rawHtml, application, scholarshipInfo, tracking, paymentParams)
    var txt = replaceVariables(rawTxt, application, scholarshipInfo, tracking, paymentParams)

    await ses.send(new SendEmailCommand({
      Destination: {
        ToAddresses: [application.email],
        BccAddresses: [replyToAddress]
      },
      Message: {
        Body: {
          Html: { Charset: "UTF-8", Data: html },
          Text: { Charset: "UTF-8", Data: txt }
        },
        Subject: {
          Charset: "UTF-8",
          Data: `💵 Scholarship Granted for the 2026 AI Accelerator`
        }
      },
      ReplyToAddresses: [replyToAddress],
      Source: replyToAddress
    }))

    // Update DB with email2Sent timestamp
    await db.send(new UpdateCommand({
      TableName: "www.innovationbound.com",
      Key: { pk: "application#ai-accelerator", sk: application.email },
      UpdateExpression: "SET email2Sent = :timestamp",
      ExpressionAttributeValues: { ":timestamp": new Date().toJSON() }
    }))

    console.log(`Email 2 sent successfully to ${application.email}`)
  } catch (error) {
    console.error(`Error sending Email 2 to ${application.email}:`, error)
    throw error // Re-throw so outer try/catch can log and continue
  }
}

// Side effect: Sends Email 3 (deadline reminder)
async function sendEmail3 (application) {
  try {
    console.log(`Sending Email 3 to ${application.email}`)

    var scholarshipInfo = scholarshipCalculations[application.assistance]
    if (!scholarshipInfo) {
      throw new Error(`Invalid assistance value: ${application.assistance}`)
    }

    // Tracking params for analytics
    var tracking = `email=${application.email}&list=ai-accelerator-followup&edition=email-3`

    // Payment params for pre-filling form (different names to avoid conflict)
    var paymentParams = `applicant=${encodeURIComponent(application.email)}&name=${encodeURIComponent(application.name)}&scholarshipAmount=${encodeURIComponent(scholarshipInfo.grantedAmount)}&finalFee=${encodeURIComponent(scholarshipInfo.fee)}&seatCost=${encodeURIComponent(scholarshipInfo.additionalSeatCost)}`

    var rawHtml = await readFile("email-3.html", "utf8")
    var rawTxt = await readFile("email-3.txt", "utf8")

    var html = replaceVariables(rawHtml, application, scholarshipInfo, tracking, paymentParams)
    var txt = replaceVariables(rawTxt, application, scholarshipInfo, tracking, paymentParams)

    await ses.send(new SendEmailCommand({
      Destination: {
        ToAddresses: [application.email],
        BccAddresses: [replyToAddress]
      },
      Message: {
        Body: {
          Html: { Charset: "UTF-8", Data: html },
          Text: { Charset: "UTF-8", Data: txt }
        },
        Subject: {
          Charset: "UTF-8",
          Data: `⏰ Scholarship Deadline Today for the 2026 AI Accelerator`
        }
      },
      ReplyToAddresses: [replyToAddress],
      Source: replyToAddress
    }))

    // Update DB with email3Sent timestamp
    await db.send(new UpdateCommand({
      TableName: "www.innovationbound.com",
      Key: { pk: "application#ai-accelerator", sk: application.email },
      UpdateExpression: "SET email3Sent = :timestamp",
      ExpressionAttributeValues: { ":timestamp": new Date().toJSON() }
    }))

    console.log(`Email 3 sent successfully to ${application.email}`)
  } catch (error) {
    console.error(`Error sending Email 3 to ${application.email}:`, error)
    throw error // Re-throw so outer try/catch can log and continue
  }
}
