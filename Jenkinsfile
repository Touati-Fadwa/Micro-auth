pipeline {
  agent any

  parameters {
    booleanParam(name: 'FORCE_DEPLOY', defaultValue: false, description: 'Force deployment regardless of branch')
  }

  environment {
    DOCKER_USERNAME = credentials('docker-username')
    DOCKER_PASSWORD = credentials('docker-password')
    IMAGE_NAME = "bibliotheque-auth"
    IMAGE_TAG = "${env.GIT_BRANCH == 'origin/main' ? 'latest' : env.GIT_BRANCH.replaceAll('origin/', '')}"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
    DOCKER_REGISTRY_URL = "https://${REGISTRY}"
  }

  stages {
    stage('Debug Info') {
      steps {
        script {
          echo "Running on branch: ${env.GIT_BRANCH}"
          echo "Image tag will be: ${IMAGE_TAG}"
          echo "Build number: ${env.BUILD_NUMBER}"
        }
      }
    }

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
          expression { params.FORCE_DEPLOY }
        }
      }
      steps {
        script {
          docker.withRegistry("${DOCKER_REGISTRY_URL}", 'docker-credentials') {
            sh """
              docker build -t ${REGISTRY}/${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG} ./microservice-auth
              docker push ${REGISTRY}/${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG}
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
          expression { params.FORCE_DEPLOY }
        }
      }
      steps {
        withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG')]) {
          dir('k8s') {
            sh """
              kubectl config set-context --current --namespace=${KUBE_NAMESPACE}
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
          expression { params.FORCE_DEPLOY }
        }
      }
      steps {
        retry(3) {
          timeout(time: 3, unit: 'MINUTES') {
            sh """
              kubectl rollout status deployment/bibliotheque-auth \
                --namespace=${KUBE_NAMESPACE} \
                --timeout=180s
            """
          }
        }
      }
    }
  }

  post {
    always {
      script {
        echo "Cleaning up Docker credentials..."
        sh "docker logout ${REGISTRY} || true"
      }
    }
    success {
      script {
        echo "Pipeline executed successfully!"
        slackSend(color: 'good', message: "Pipeline SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER}")
      }
    }
    failure {
      script {
        echo "Pipeline failed!"
        slackSend(color: 'danger', message: "Pipeline FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}")
        
        // Automatic rollback if deployment failed
        withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG')]) {
          sh """
            kubectl rollout undo deployment/bibliotheque-auth \
              --namespace=${KUBE_NAMESPACE} || true
          """
        }
      }
    }
  }
}