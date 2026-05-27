# Guion de presentación TFG - MyPredicts

Duración objetivo: 15 minutos.

Este guion sigue la estructura de la presentación `MyPredicts_Presentacion.pptx`, pero está ajustado al estado final de la aplicación: plataforma educativa, predicciones ML, backtesting, marketplace, monedas internas, suscripción PRO, ruleta, reviews, noticias, panel de administración y despliegue en AWS.

## 1. Portada - 40 segundos

Buenos días. Somos Miguel Echeverria, Marc Cajamarca y Angel Alameda, y vamos a presentar MyPredicts.

MyPredicts es una plataforma web de predicción financiera con Machine Learning. La idea principal del proyecto es crear un entorno educativo donde un usuario pueda consultar activos financieros, generar predicciones, probar estrategias mediante backtesting y trabajar con una economía interna basada en monedas virtuales.

Desde el principio marcamos una frontera clara: MyPredicts no es una plataforma de inversión real, no conecta con brokers y no ofrece asesoramiento financiero. Es una herramienta para aprender, experimentar y comparar modelos sobre datos de mercado.

## 2. ¿Qué es MyPredicts? - 55 segundos

MyPredicts combina varias piezas en un único producto.

Por un lado, tiene la parte de predicción financiera, donde el usuario elige un ticker y genera una predicción usando varios modelos. Por otro lado, tiene backtesting, que permite comprobar cómo se habría comportado una estrategia en datos históricos.

También incluye marketplace de estrategias, una wallet con monedas internas, suscripción PRO, ruleta de recompensas, noticias financieras, reviews y un panel de administración.

La aplicación está desplegada en AWS, funciona con HTTPS y está pensada para ser defendible como producto completo, no como una colección de pantallas sueltas.

## 3. Objetivos del proyecto - 1 minuto

Los objetivos principales fueron cuatro.

El primero fue crear una plataforma educativa de finanzas, sin dinero real y sin riesgo para el usuario.

El segundo fue aplicar modelos de predicción temporal a datos financieros reales. No buscábamos prometer una precisión perfecta, porque el mercado es volátil, sino mostrar de forma honesta cómo se pueden comparar modelos y medir errores.

El tercero fue desplegar la aplicación en un entorno real de producción. Para ello usamos AWS, Nginx, Gunicorn, PostgreSQL, Redis, Celery y HTTPS.

El cuarto fue añadir una capa de gamificación y economía interna. Las monedas virtuales permiten comprar estrategias dentro del sistema, y Stripe queda limitado a recargas y suscripciones.

## 4. Funcionalidades principales - 1 minuto

Las funcionalidades principales son:

Predicciones ML: el usuario selecciona un ticker, configura horizonte y ventana de entrenamiento, y el sistema calcula predicciones con modelos como ARIMA, Exponential Smoothing y Media Móvil.

Backtesting: permite simular una estrategia sobre un periodo histórico y obtener métricas como rentabilidad, drawdown, win rate y evolución de capital.

Marketplace: los usuarios pueden crear estrategias, guardarlas para uso propio o publicarlas para venderlas con monedas internas.

Wallet y monedas: las monedas se compran con Stripe, se ganan con la ruleta y se gastan dentro del marketplace.

Panel admin: permite revisar usuarios, estadísticas, billing y estado general del sistema.

## 5. Marketplace de estrategias - 1 minuto

El marketplace es una parte importante porque conecta la parte de predicción con la economía interna.

Un usuario puede crear una estrategia a partir de una idea o una predicción. Esa estrategia puede quedarse como privada, para consultarla más adelante, o publicarse para venderla.

Si se publica, el precio siempre se define en monedas internas. No se usa Stripe para comprar estrategias directamente. Esto mantiene la coherencia del producto: Stripe solo se usa para comprar monedas o pagar la suscripción PRO.

Cuando otro usuario compra una estrategia, se descuentan monedas de su wallet y se suman al vendedor. Además, el comprador desbloquea el contenido completo y puede copiar la estrategia a su portfolio virtual.

## 6. Gamificación y economía interna - 55 segundos

La gamificación se apoya principalmente en dos elementos: monedas internas y ruleta diaria.

Las monedas no tienen valor real. Solo sirven dentro del ecosistema de MyPredicts. Esto permite simular compras y recompensas sin convertir la plataforma en un sistema financiero real.

La ruleta diaria permite conseguir monedas o recompensas internas. La idea es aumentar la participación sin introducir riesgo económico.

La suscripción PRO simplifica el modelo comercial. En lugar de muchos planes, se mantiene un único plan de pago con las funciones avanzadas: backtesting completo, marketplace, venta de estrategias y mayor acceso a herramientas.

## 7. Backtesting - 1 minuto

El backtesting permite evaluar una estrategia con datos históricos.

El usuario indica ticker, rango de fechas, capital inicial, tamaño de posición y modelos que quiere comparar. El sistema recopila datos si faltan, calcula resultados y devuelve una simulación.

La parte importante no es decir que una estrategia siempre vaya a funcionar, sino mostrar métricas que ayuden a entender el comportamiento: rentabilidad, capital final, drawdown, ratio Sharpe, operaciones ganadoras y perdedoras.

En la interfaz se muestra una curva de rendimiento con el mismo estilo visual que el resto de la aplicación, manteniendo coherencia entre predicción y simulador.

## 8. Flujo de predicción - 1 minuto 10 segundos

El flujo de predicción sigue varios pasos.

Primero se obtienen datos históricos del ticker, principalmente a través de yfinance. Si el sistema no tiene datos suficientes en base de datos, intenta recopilarlos antes de calcular.

Después se normalizan los datos y se prepara una ventana de entrenamiento. El usuario puede configurar cuántos días históricos usa el modelo y qué horizonte quiere predecir.

Luego se ejecutan los modelos seleccionados. Cada modelo produce su propia predicción y sus métricas de error.

Finalmente, el sistema guarda el resultado en PostgreSQL, lo muestra en pantalla y lo deja disponible en el historial del usuario y en el portfolio virtual.

## 9. Modelos de Machine Learning - 1 minuto 20 segundos

MyPredicts usa tres enfoques complementarios.

ARIMA es un modelo clásico de series temporales. Trabaja bien cuando la serie tiene estructura estadística aprovechable, aunque no entiende noticias ni contexto externo.

Exponential Smoothing, o suavizado exponencial, se centra en tendencia y comportamiento reciente. Es útil para detectar continuidad en movimientos.

La Media Móvil funciona como modelo base. Es más simple, pero sirve como referencia para comparar si modelos más complejos realmente aportan mejora.

El sistema no promete certeza. En mercados financieros una precisión realista puede rondar el 55 o 60 por ciento según contexto y horizonte. Por eso la aplicación muestra métricas, comparación y consenso, en vez de ocultar la incertidumbre.

## 10. Stack tecnológico - 1 minuto

En backend se usa Flask con SQLAlchemy, JWT, Celery, Redis, Stripe SDK y Gunicorn.

Flask expone la API REST. SQLAlchemy gestiona los modelos y PostgreSQL almacena usuarios, predicciones, carteras, transacciones, estrategias y billing.

Celery y Redis permiten ejecutar tareas separadas del proceso web, como trabajos programados o procesos más pesados.

En frontend se usa React con Vite, Redux Toolkit, Material UI, Tailwind, Plotly y Recharts. La aplicación está diseñada como SPA, con rutas protegidas y llamadas a API mediante Axios.

## 11. Arquitectura del sistema - 1 minuto 15 segundos

La arquitectura está separada por capas.

El frontend es una aplicación React servida desde Nginx. El backend Flask corre con Gunicorn detrás de Nginx y expone la API.

La base de datos está en RDS PostgreSQL. Redis se ejecuta en la EC2 para reducir coste y dar soporte a Celery.

Los servicios principales están separados con systemd: API, worker y beat. Esto permite reiniciar o revisar cada proceso de forma independiente.

La elección de arquitectura está pensada para AWS Academy: suficientemente profesional para justificar decisiones técnicas, pero sin servicios caros como NAT Gateway, ALB, ECS, Fargate o ElastiCache.

## 12. Seguridad - 1 minuto 15 segundos

La seguridad se trabajó en varias capas.

Primero, autenticación con JWT y roles. Hay usuarios normales y administradores, con permisos diferentes.

Segundo, validación de configuración en producción. El backend no arranca en producción si las claves son inseguras, si CORS apunta a localhost o si faltan variables críticas.

Tercero, HTTPS con Nginx y Certbot para proteger el tráfico.

Cuarto, Stripe webhook con firma. El backend valida el secreto del webhook antes de aceptar eventos.

Quinto, protección del repositorio. Los `.env`, claves `.pem`, outputs de AWS, builds y dependencias instaladas quedan fuera del repo y del paquete de despliegue.

## 13. Balance: logros y limitaciones - 1 minuto

Los principales logros son:

La aplicación está desplegada y accesible con dominio propio.

La API REST funciona con autenticación JWT.

Las predicciones se guardan en historial y portfolio virtual.

El backtesting genera métricas y gráficos.

El marketplace usa monedas internas de forma coherente.

Stripe está integrado para recargas y suscripción.

También hay limitaciones. La precisión de los modelos es limitada, como ocurre normalmente en mercados reales. La disponibilidad depende de AWS Academy y sus sesiones. Los datos dependen de proveedores externos como Yahoo Finance. Y la plataforma no conecta con brokers reales porque el enfoque es educativo.

## 14. Próximos pasos - 50 segundos

Como mejoras futuras se podrían añadir modelos más avanzados, como LSTM, Transformers o XGBoost.

También sería interesante ampliar mercados: criptomonedas, forex, commodities o análisis de noticias con NLP.

Otra línea sería mejorar el análisis de riesgo con métricas como VaR, Beta o CVaR.

Y, si se quisiera llevar a un producto real, habría que reforzar monitorización, observabilidad, escalabilidad y cumplimiento legal antes de acercarse a cualquier integración con brokers.

## 15. Conclusiones - 1 minuto

MyPredicts demuestra que se puede construir una plataforma completa combinando desarrollo full-stack, Machine Learning, cloud, seguridad y diseño de producto.

La parte más importante es la coherencia: Stripe se usa para pagos externos, las monedas se usan dentro de la plataforma, las predicciones se guardan, el marketplace tiene sentido y el usuario puede recorrer flujos reales de principio a fin.

El proyecto no promete que el mercado sea predecible de forma perfecta. Al contrario, muestra resultados, métricas y límites de forma transparente.

Por eso MyPredicts encaja como TFG: tiene complejidad técnica, despliegue real, base de datos, autenticación, frontend completo, integración con servicios externos y una narrativa clara de producto educativo.

## 16. Cierre - 20 segundos

Muchas gracias por la atención.

Quedamos disponibles para preguntas sobre arquitectura, modelos, despliegue, seguridad, Stripe, base de datos o cualquier parte funcional de la plataforma.
