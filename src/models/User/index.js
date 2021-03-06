import moment from 'moment'
import mongoose from 'mongoose'

import userSchema from './schema'

userSchema.statics.createOrUpdate = async function (payload) {
  const alreadyExists = await this.findOne({ uuid: payload.uuid })
  let user, isNew

  if (alreadyExists) {
    user = await this.findOneAndUpdate({ uuid: payload.uuid }, payload, {
      runValidators: true,
      new: true
    })
  } else {
    user = await this.create(payload)
    isNew = true
  }
  return { isNew, user }
}

userSchema.statics.updateAchievements = async function ({
  uuid,
  achievements
}) {
  return this.findOneAndUpdate(
    { uuid },
    { achievements },
    {
      runValidators: true,
      upsert: true,
      setDefaultsOnInsert: true,
      new: true
    }
  )
}

userSchema.statics.updateScore = async function ({ uuid, score, level }) {
  return this.findOneAndUpdate(
    { uuid },
    { score, level, lastInteraction: moment().toDate() },
    {
      runValidators: true,
      upsert: true,
      setDefaultsOnInsert: true,
      new: true
    }
  )
}

userSchema.statics.deleteUserData = async function (uuid) {
  const { deletedCount } = await this.deleteOne({ uuid })
  if (deletedCount) {
    const scores = await mongoose.model('Score').deleteMany({ user: uuid })
    const messages = await mongoose.model('Message').deleteMany({ user: uuid })

    const reactions = await mongoose
      .model('Reaction')
      .deleteMany({ user: uuid })

    const levels = await mongoose
      .model('LevelHistory')
      .deleteMany({ user: uuid })

    return { scores, reactions, messages, levels }
  }
  return { notFound: true }
}

export default mongoose.model('User', userSchema)
