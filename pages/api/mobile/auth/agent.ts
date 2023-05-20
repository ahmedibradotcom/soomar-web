import nc from 'next-connect'
import db from '../../../../config/db'
import Profile from '../../../../models/Profile'
import User from '../../../../models/User'
import UserRole from '../../../../models/UserRole'
import { Markets } from '../../../../utils/Markets'
import { getToken, sendSMS } from '../../../../utils/SMS'
import { useEVCPayment } from '../../../../hooks/useEVCPayment'

const handler = nc()

handler.post(
  async (req: NextApiRequestExtended, res: NextApiResponseExtended) => {
    await db()
    try {
      const { name, market } = req.body

      let mobile = req.body.mobile

      if (mobile.length !== 9) {
        if (mobile.startsWith('0')) {
          mobile = mobile.slice(1)
        } else if (mobile.startsWith('252')) {
          mobile = mobile.slice(3)
        } else {
          mobile = mobile.slice(0, 9)
        }
      }

      if (mobile.length !== 9)
        return res.status(400).json({ error: 'Invalid mobile number' })

      if (market && !Markets.includes(market))
        return res.status(400).json({ error: 'Invalid market' })

      const checkExist = await User.findOne({ mobile })
      if (checkExist)
        return res.status(400).json({ error: 'Mobile number already exist' })

      const email = `${mobile}@soomar.app`
      const confirmed = true
      const blocked = false

      const { MERCHANT_U_ID, API_USER_ID, API_KEY, MERCHANT_ACCOUNT_NO } =
        process.env

      const paymentInfo = await useEVCPayment({
        merchantUId: MERCHANT_U_ID,
        apiUserId: API_USER_ID,
        apiKey: API_KEY,
        customerMobileNumber: `252${mobile}`,
        description: `${name} has paid ${0.2} for agent registration`,
        amount: 0.2,
        withdrawTo: 'MERCHANT',
        withdrawNumber: MERCHANT_ACCOUNT_NO,
      })

      if (paymentInfo.responseCode !== '2001')
        return res.status(401).json({ error: `Payment failed` })

      const object = await User.create({
        name,
        email,
        mobile,
        confirmed,
        blocked,
      })

      object.getRandomOtp()
      const otpGenerate = await object.save()
      if (!otpGenerate) {
        await object.remove()
        return res.status(400).json({ error: 'OTP not generated' })
      }

      await Profile.create({
        user: object._id,
        name: object.name,
        image: `https://ui-avatars.com/api/?uppercase=true&name=${object.name}&background=random&color=random&size=128`,
        mobile,
        market,
      })

      await UserRole.create({
        user: object._id,
        role: '5e0af1c63b6482125c1b44ce', // Agent role
      })

      const token = await getToken()
      const sms = await sendSMS({
        token: token.access_token,
        mobile,
        message: `Your OTP is ${object.otp}`,
      })

      if (sms)
        return res.status(200).json({ _id: object?._id, otp: object?.otp })

      return res
        .status(500)
        .json({ error: 'Something went wrong, please try again' })
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }
)

export default handler
