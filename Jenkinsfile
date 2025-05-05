pipeline {
  agent any

  environment {
    DOCKER_USERNAME = credentials('docker-username') // ID dans Jenkins Credentials
    DOCKER_PASSWORD = credentials('docker-password') // ID dans Jenkins Credentials
    IMAGE_NAME = "bibliotheque-auth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('microservice-auth') {
          sh 'npm ci'
        }
      }
    }

    stage('Build') {
      steps {
        dir('microservice-auth') {
          sh 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('microservice-auth') {
          sh 'npm test -- --coverage'
        }
      }
    }

    stage('Docker Build & Push') {
      when {
        expression { env.BRANCH_NAME == 'main' }
      }
      steps {
        script {
          docker.withRegistry("https://${env.REGISTRY}", '') {
            sh """
              echo "${DOCKER_PASSWORD}" | docker login -u "${DOCKER_USERNAME}" --password-stdin
              docker build -t ${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG} ./microservice-auth
              docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG}
            """
          }
        }
      }
    }

    stage('Deploy to K3s') {
      when {
        expression { env.BRANCH_NAME == 'main' }
      }
      steps {
        withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG')]) {
          sh '''
            kubectl apply -f k8s/bibliotheque-auth-deployment.yaml
            kubectl apply -f k8s/bibliotheque-auth-service.yaml
          '''
        }
      }
    }

    stage('Verify Deployment') {
      when {
        expression { env.BRANCH_NAME == 'main' }
      }
      steps {
        sh 'kubectl rollout status deployment/bibliotheque-auth -n bibliotheque --timeout=180s'
      }
    }

    stage('Rollback on Failure') {
      when {
        expression { env.BRANCH_NAME == 'main' }
      }
      steps {
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
          sh '''
            kubectl rollout undo deployment/bibliotheque-auth -n bibliotheque || true
            echo "Deployment failed, rollback triggered"
          '''
        }
      }
    }

  }
}
