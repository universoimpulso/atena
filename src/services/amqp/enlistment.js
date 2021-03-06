import { sendError } from 'log-on-slack'
import moment from 'moment'

import { achievementTypes } from '../../config/achievements'
import { products } from '../../config/achievements/clickOnProduct'
import AchievementController from '../../controllers/AchievementController'
import ScoreController from '../../controllers/ScoreController'
import UserController from '../../controllers/UserController'
import Score from '../../models/Score'
import { scoreTypes } from '../../models/Score/schema'
import User from '../../models/User'
import { sendInteractionToQueue } from '../../services/queue'
import { formatUser } from '../../utils'

export const handle = async ({ message, channel }) => {
  try {
    const { content, properties } = message
    const data = JSON.parse(content.toString())
    const types = {
      Impulser: handleUser,
      'Ahoy::Event': handleEvent
    }

    const service = types[properties.type]

    if (service) await service(data)
  } catch (error) {
    sendError({
      file: 'services/amqp/enlistment - handle',
      payload: {
        message: JSON.parse(message.content.toString()),
        type: message.properties.type
      },
      error
    })
  } finally {
    channel.ack(message)
  }
}

const handleUser = async data => {
  const user = formatUser(data)

  if (user.anonymizedAt) {
    await UserController.anonymize(user)
  } else if (user.status === 'active') {
    await UserController.handle(user)
  }
}

const handleEvent = async data => {
  const options = {
    product: handleClickOnProduct,
    meetup_participation: handleMeetupParticipation
  }

  const handler = options[data.properties.track_type]
  if (handler) await handler(data)
}

const handleMeetupParticipation = async ({ properties }) => {
  const { email, meetupName: meetup, date } = properties

  if (!moment(date).isSame(moment(), 'day')) return

  const user = await User.findOne({ email })
  if (!user) return

  const alreadyScored = await Score.findOne({
    user: user.uuid,
    'details.meetup': meetup
  })
  if (alreadyScored) return

  const updatedUser = await ScoreController.handleMeetupParticipation({
    user,
    meetup
  })

  await AchievementController.handle({
    user: updatedUser,
    achievementType: achievementTypes.participatedToMeetup
  })
}

const handleClickOnProduct = async data => {
  try {
    const { properties, impulser_uuid, time } = data

    if (!properties.name || !Object.keys(products).includes(properties.name))
      return

    if (!impulser_uuid || !time) throw new Error('Required fields not provided')

    const achievementType = products[properties.name]
    const payload = {
      scoreType: scoreTypes.clickOnProduct,
      achievementType,
      queries: {
        user: { uuid: impulser_uuid },
        details: { 'details.product': achievementType }
      },
      details: {
        provider: 'impulser.app',
        product: achievementType,
        occurredAt: time
      }
    }

    const user = await User.findOne(payload.query)

    if (!user) {
      return sendInteractionToQueue.add(payload, {
        delay: 600000,
        removeOnComplete: true
      })
    }
    await ScoreController.handleExternalInteraction(payload)
  } catch (error) {
    sendError({
      file: 'services/amqp/enlistment - handleEvent',
      payload: data,
      error
    })
  }
}
