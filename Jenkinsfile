pipeline {
  agent any

  environment {
    DOCKER_USERNAME = credentials('docker-username')
    DOCKER_PASSWORD = credentials('docker-password')
    IMAGE_NAME = "bibliotheque-auth"
    IMAGE_TAG = "${env.BRANCH_NAME == 'main' ? 'latest' : env.BRANCH_NAME}"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install Dependencies') {
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
        anyOf {
          branch 'main'
          branch 'dev'
          expression { params.FORCE_DEPLOY == true }
        }
      }
      steps {
        script {
          docker.withRegistry("https://${env.REGISTRY}", 'docker-credentials') {
            sh """
              docker build -t ${env.REGISTRY}/${env.DOCKER_USERNAME}/${env.IMAGE_NAME}:${env.IMAGE_TAG} ./microservice-auth
              docker push ${env.REGISTRY}/${env.DOCKER_USERNAME}/${env.IMAGE_NAME}:${env.IMAGE_TAG}
            """
          }
        }
      }
    }

    stage('Deploy to K3s') {
      when {
        anyOf {
          branch 'main'
          branch 'dev'
          expression { params.FORCE_DEPLOY == true }
        }
      }
      steps {
        withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG')]) {
          dir('k8s') {
            sh """
              kubectl config set-context --current --namespace=${env.KUBE_NAMESPACE}
              kubectl apply -f bibliotheque-auth-deployment.yaml
              kubectl apply -f bibliotheque-auth-service.yaml
            """
          }
        }
      }
    }

    stage('Verify Deployment') {
      when {
        anyOf {
          branch 'main'
          branch 'dev'
          expression { params.FORCE_DEPLOY == true }
        }
      }
      steps {
        retry(3) {
          timeout(time: 3, unit: 'MINUTES') {
            sh """
              kubectl rollout status deployment/bibliotheque-auth \
                --namespace=${env.KUBE_NAMESPACE} \
                --timeout=180s
            """
          }
        }
      }
    }

    stage('Rollback on Failure') {
      when {
        anyOf {
          branch 'main'
          branch 'dev'
          expression { params.FORCE_DEPLOY == true }
        }
        expression { currentBuild.result == 'FAILURE' }
      }
      steps {
        script {
          echo "Rolling back deployment due to failure..."
          sh """
            kubectl rollout undo deployment/bibliotheque-auth \
              --namespace=${env.KUBE_NAMESPACE} || true
          """
        }
      }
    }
  }

  post {
    always {
      script {
        echo "Cleaning up Docker credentials..."
        sh 'docker logout ${env.REGISTRY} || true'
      }
    }
    success {
      echo "Pipeline executed successfully!"
    }
    failure {
      echo "Pipeline failed!"
    }
  }
}