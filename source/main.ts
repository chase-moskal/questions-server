
import Koa from "koa"
import mount from "koa-mount"
import {apiServer} from "renraku/dist/api-server.js"
import {curryVerifyToken} from "redcrypto/dist/curries/curry-verify-token.js"

import {Logger} from "authoritarian/dist/toolbox/logger.js"
import {health} from "authoritarian/dist/toolbox/health.js"
import {read, readYaml} from "authoritarian/dist/toolbox/reading.js"
import {connectMongo} from "authoritarian/dist/toolbox/connect-mongo.js"
import {deathWithDignity} from "authoritarian/dist/toolbox/death-with-dignity.js"
import {unpackCorsConfig} from "authoritarian/dist/toolbox/unpack-cors-config.js"
import {makeAuthClients} from "authoritarian/dist/business/auth-api/auth-clients.js"
import {QuestionsApi, QuestionsServerConfig} from "authoritarian/dist/interfaces.js"
import {makeQuestionsBureau} from "authoritarian/dist/business/questions-bureau/bureau.js"
import {makeProfileMagistrateClient} from "authoritarian/dist/business/profile-magistrate/magistrate-client.js"
import {mongoQuestionsDatalayer} from "authoritarian/dist/business/questions-bureau/mongo-questions-datalayer.js"

const logger = new Logger()
deathWithDignity({logger})

const paths = {
	config: "config/config.yaml",
	authServerPublicKey: "config/auth-server.public.pem",
}

~async function main() {
	const config: QuestionsServerConfig = await readYaml(paths.config)
	const {debug} = config
	const {port} = config.questionsServer
	const database = await connectMongo(config.mongo)
	const collection = database.collection("questions")
	const authServerPublicKey = await read(paths.authServerPublicKey)
	const {authServerOrigin, profileServerOrigin} = config.questionsServer

	const questionsDatalayer = mongoQuestionsDatalayer({collection})
	const verifyToken = curryVerifyToken(authServerPublicKey)
	const {authDealer} = await makeAuthClients({authServerOrigin})
	const profileMagistrate = await makeProfileMagistrateClient({
		profileServerOrigin
	})

	const questionsBureau = makeQuestionsBureau({
		authDealer,
		verifyToken,
		profileMagistrate,
		questionsDatalayer,
	})

	const {koa: apiKoa} = await apiServer<QuestionsApi>({
		debug,
		logger,
		exposures: {
			questionsBureau: {
				exposed: questionsBureau,
				cors: unpackCorsConfig(config.cors)
			}
		}
	})

	new Koa()
		.use(health({logger}))
		.use(mount("/api", apiKoa))
		.listen({host: "0.0.0.0", port})

	logger.info(`🌐 questions-server on ${port}`)

}().catch(error => logger.error(error))
