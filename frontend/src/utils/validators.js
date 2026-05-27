import * as yup from 'yup'

export const loginSchema = yup.object({
  email:    yup.string().email('Email inválido').required('Email requerido'),
  password: yup.string().min(6, 'Mínimo 6 caracteres').required('Contraseña requerida'),
})

export const registerSchema = yup.object({
  username:        yup.string().min(3,'Mínimo 3 caracteres').max(50,'Máximo 50').required('Usuario requerido'),
  email:           yup.string().email('Email inválido').required('Email requerido'),
  password:        yup.string()
    .min(8,'Mínimo 8 caracteres')
    .matches(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/, 'Debe incluir al menos una letra')
    .matches(/\d/, 'Debe incluir al menos un número')
    .required('Contraseña requerida'),
  confirmPassword: yup.string()
    .oneOf([yup.ref('password')], 'Las contraseñas no coinciden')
    .required('Confirma tu contraseña'),
})

export const alertSchema = yup.object({
  ticker:     yup.string().min(1).max(10).required('Ticker requerido'),
  alert_type: yup.string().required('Tipo requerido'),
  condition:  yup.string().when('alert_type', {
    is: 'price_threshold',
    then: s => s.required('Condición requerida'),
  }),
  trigger_value: yup.number().when('alert_type', {
    is: 'price_threshold',
    then: s => s.positive('Debe ser positivo').required('Valor requerido'),
  }),
})

export const portfolioSchema = yup.object({
  name:            yup.string().min(2,'Mínimo 2 caracteres').required('Nombre requerido'),
  initial_capital: yup.number().positive('Debe ser positivo').required('Capital requerido'),
})

export const positionSchema = yup.object({
  ticker:    yup.string().min(1).max(10).required('Ticker requerido'),
  quantity:  yup.number().positive('Debe ser positivo').required('Cantidad requerida'),
  buy_price: yup.number().positive('Debe ser positivo').required('Precio requerido'),
  buy_date:  yup.date().required('Fecha requerida'),
})
