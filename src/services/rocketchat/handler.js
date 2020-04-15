import moment from 'moment'

import { providers } from '../../models/Message'
import CommandController from '../../controllers/CommandController'
import ReactionController from '../../controllers/ReactionController'
import MessageController from '../../controllers/MessageController'
import LogController from '../../controllers/LogController'
import { getPreviousMessage } from './api'

export const handlePayload = async ({ message, messageOptions }) => {
  try {
    const isChannelMessage = messageOptions.roomType === 'c'
    const isCommand = Object.keys(CommandController.commands).includes(
      message.msg.split(' ')[0]
    )

    const payload = formatPayload({ message, messageOptions })

    if (isCommand) return CommandController.handle(payload)

    if (isChannelMessage) {
      const previousMessage = await getPreviousMessage({ roomId: message.rid })

      MessageController.handle({ previousMessage, ...payload })
      ReactionController.handle(payload)
    }
  } catch (error) {
    LogController.sendNotify({
      type: 'error',
      file: 'services/rocketchat/message.js',
      resume: 'Error in handlePayload',
      details: error
    })
  }
}

export const handleUserStatus = ({ rocketId, username, status }) => {
  console.log({ rocketId, username, status })
}

const formatPayload = ({ message, messageOptions }) => {
  try {
    const reactions = formatReactions({ message, messageOptions })

    const payload = {
      content: message.msg,
      createdAt: moment(message.ts.$date).toDate(),
      updatedAt: moment(message._updatedAt.$date).toDate(),
      threadCount: message.tcount || 0,
      reactionCount: reactions.length,
      reactions,
      provider: {
        name: providers.rocketchat,
        messageId: message._id,
        room: {
          id: message.rid,
          name: messageOptions.roomName
        },
        user: {
          id: message.u._id,
          username: message.u.username,
          name: message.u.name
        }
      }
    }
    if (message.tmid) payload.provider.parentId = message.tmid
    // todo
    return payload
  } catch (error) {
    throw Error(error)
  }
}

const formatReactions = ({ message, messageOptions }) => {
  const reactions = []
  if (!message.reactions) return reactions

  for (const reaction of Object.entries(message.reactions)) {
    for (const username of reaction[1].usernames) {
      reactions.push({
        content: reaction[0],
        provider: {
          name: providers.rocketchat,
          messageId: message._id,
          room: {
            id: message.rid,
            name: messageOptions.roomName
          },
          username
        }
      })
    }
  }
  return reactions
}
