import { PrismaClient } from '@prisma/client'
import { URL } from 'url'

export async function getDatabaseName() {
  const prisma = new PrismaClient()

  try {
    // Get the database URL from Prisma client
    const datasource = prisma['_engineConfig'].datasources[0]
    const dbUrl = datasource.url.value

    // Extract database name from connection string
    const dbName = new URL(dbUrl).pathname.replace(/^\//, '')
    return dbName
  } catch (error) {
    console.error('Error retrieving database name:', error)
    throw error
  }
}

export async function inspectUserData(userId) {
  const prisma = new PrismaClient()

  try {
    // Get all model names from your Prisma schema
    const models = Object.keys(prisma).filter(
      key => typeof prisma[key] === 'object' && prisma[key] !== null
    )

    const userDataSummary = {
      databaseName: await getDatabaseName(),
      models: {}
    }

    // Count documents for each model for a specific user
    for (const model of models) {
      try {
        const count = await prisma[model].count({
          where: { userId: userId }
        })
        if (count > 0) {
          userDataSummary.models[model] = count
        }
      } catch (error) {
        // Skip models without userId field
        console.log(`Skipping ${model} - no userId field`)
      }
    }

    return userDataSummary
  } catch (error) {
    console.error('User Data Inspection Error:', error)
    throw error
  }
}

export async function deleteAllUserData(userId) {
  const prisma = new PrismaClient()

  try {
    // Get all model names from your Prisma schema
    const models = Object.keys(prisma).filter(
      key => typeof prisma[key] === 'object' && prisma[key] !== null
    )

    const deletionResults = {
      databaseName: await getDatabaseName(),
      models: {}
    }

    // Delete documents for each model for a specific user
    for (const model of models) {
      try {
        const deleteResult = await prisma[model].deleteMany({
          where: { userId: userId }
        })
        
        if (deleteResult.count > 0) {
          deletionResults.models[model] = deleteResult.count
        }
      } catch (error) {
        // Skip models without userId field
        console.log(`Skipping ${model} - no userId field`)
      }
    }

    return deletionResults
  } catch (error) {
    console.error('User Data Deletion Error:', error)
    throw error
  }
}

export async function deleteSpecificUserData(userId, dataType) {
    const prisma = new PrismaClient()
  
    try {
      // Mapping of data types to Prisma models
      const dataTypeToModel = {
        'watchHistory': 'watchHistory',
        'likedVideos': 'likedVideo',
        'playlists': 'playlist',
        'comments': 'comment',
        'tweets': 'tweet',
        // Add more mappings as needed
      }
  
      // Check if the data type is valid
      if (!dataTypeToModel[dataType]) {
        throw new Error(`Invalid data type: ${dataType}`)
      }
  
      // Delete specific type of data for the user
      const deleteResult = await prisma[dataTypeToModel[dataType]].deleteMany({
        where: { userId: userId }
      })
  
      return {
        dataType,
        deletedCount: deleteResult.count
      }
    } catch (error) {
      console.error(`Error deleting ${dataType}:`, error)
      throw error
    } finally {
      await prisma.$disconnect()
    }
  }