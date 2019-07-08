import service from './githubService'
import utils from './githubUtils'
import dal from './githubDAL'
import errors from '../errors'
import users from '../users'
import interactions from '../interactions'
import settings from '../settings'

const file = 'Github | Controller'

const auth = async data => {
  try {
    let response = 'Ops! Não conseguimos responder a esse comando agora. :/'
    const user = await users.findOne({ rocketId: data.u._id })
    if (!user) {
      response = utils.getMessages('firstInteraction')
    } else if (!user.githubId) {
      const authUrl = utils.getStartUrl(user.rocketId)
      response = utils.getMessages('noPermission', {
        username: user.name,
        url: authUrl
      })
    } else {
      response = utils.getMessages('letsWork', {
        username: user.name
      })
    }

    return { msg: response }
  } catch (e) {
    errors._throw(file, 'auth', e)
  }
}

const addUser = async (githubCode, rocketId) => {
  try {
    const url = process.env.ATENA_URL
    let response = {
      redirect: `${url}/github/error`
    }

    const user = await users.findOne({ rocketId: rocketId })
    if (user) {
      let data = await service.getAccessToken(githubCode)

      if (data.access_token) {
        const githubInfo = await service.getUserInfo(data.access_token)
        user.githubId = githubInfo.data.id
        await users.save(user)

        response.redirect = `${url}/github/success`
      } else if (data.error) {
        const authUrl = utils.getStartUrl(rocketId)
        response.redirect = `${url}/github/retry?url=${authUrl}`
      }
    }

    return response
  } catch (e) {
    errors._throw(file, 'auth', e)
  }
}

// const addExcludedUser = async req => {
//   let response = { msg: 'Não foi possível adicionar o usuário ao repositório.' }
//   const username = req.u.username
//   const rocketId = req.u._id
//   const excludedUsername = req.msg.split(' ')[1].split('@')[1]
//   const repositoryId = req.msg.split(' ')[2]
//   let repository = null
//   usersController
//     .find({ rocketId: rocketId })
//     .then(user => {
//       if (!user.isCoreTeam) {
//         return Promise.reject('Você não é do coreteam.')
//       }
//       return !isValidRepository(repositoryId)
//     })
//     .then(() => {
//       return getRepository(repositoryId)
//     })
//     .then(res => {
//       repository = res
//       return usersController.find({ username: excludedUsername })
//     })
//     .then(user => {
//       repository.excludedUsers.push({ userId: user._id })
//       return repository.save()
//     })
//     .then(() => {
//       response.msg = `Usuário @${excludedUsername} adicionado com sucesso`
//       return response.msg
//     })
//     .catch(err => {
//       response.msg = err
//     })
//     .then(() => {
//       driver.sendDirectToUser(response, username)
//     })
// }

const addRepository = async req => {
  let response = 'Não foi possível adicionar esse repositório. :/'

  const user = await users.findOne({ rocketId: req.u._id })
  if (!user || !user.isCoreTeam) {
    return {
      msg:
        'Ops! Você não tem permissão para adicionar repositórios. Procure com alguém do core team.'
    }
  }

  const repositoryId = req.msg.split(' ')[1]
  if (!repositoryId) {
    return { msg: 'Ops! Faltou enviar o id do repositório. :/' }
  }

  const isExistent = await service.isExistentRepository(repositoryId)
  if (isExistent) {
    response =
      'Este repositório já foi cadastrado anteriormente. É só seguir codando! :)'
  } else {
    await dal.save({ repositoryId: repositoryId })
    response = 'Repositório adicionado com sucesso! :)'
  }

  return { msg: response }
}

const handle = async data => {
  const repositoryId = data.repository.id.toString()
  data.origin = 'github'

  data.type = utils.getType(data)
  if (!data.type) {
    return { error: 'Tipo incorreto de interação' }
  }

  const isExistent = await service.isExistentRepository(repositoryId)
  if (!isExistent) {
    return { error: 'Repositório inválido' }
  }

  const githubId = utils.getId(data)
  const user = await users.findOne({ githubId: githubId })
  if (!user) return { error: 'Usuário inválido' }
  data.user = user._id

  const wasExcluded = await service.isExcludedUser(repositoryId, user._id)
  if (wasExcluded) {
    return {
      error: 'Esse usuário não faz parte do time, não pode pontuar.'
    }
  }

  const interaction = await interactions.handle(data)

  data.interaction = interaction
  if (interaction.score > 0) await service.sendMessage(user)

  return data
}

const normalize = async data => {
  return service.normalize(data)
}

const getDailyLimit = async () => {
  return settings.getValue('github_daily_limit')
}

const isFlood = async () => {
  return false
}

const findOrCreateUser = async interaction => {
  return users.findOne({ _id: interaction.user })
}

export default {
  handle,
  auth,
  addUser,
  addRepository,
  normalize,
  getDailyLimit,
  isFlood,
  findOrCreateUser
}
